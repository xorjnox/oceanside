use std::sync::mpsc;
use std::path::Path;
use anyhow::anyhow;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

use crate::audio::{
    self, AudioState, BeepParams, MicTestHandle, RecordingHandle,
    beep::generate_beep_i16,
    capture::{get_device_by_id, list_input_devices, rms_level, f32_to_i16},
    writer::create_wav_writer,
};

#[derive(Serialize)]
pub struct AudioDevice {
    id: String,
    name: String,
}

#[derive(Deserialize)]
pub struct RecordingConfig {
    pub device_id: String,
    pub output_path: String,
    pub sample_rate: u32,
    pub beep_interval_sec: u64,
    pub beep_freq_hz: f32,
    pub beep_duration_sec: f32,
}

#[derive(Serialize)]
pub struct DiskSpace {
    free: u64,
    total: u64,
}

// ── Device listing ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    list_input_devices()
        .map(|devices| {
            devices
                .into_iter()
                .map(|d| AudioDevice { id: d.id, name: d.name })
                .collect()
        })
        .map_err(|e| e.to_string())
}

// ── Mic test ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_mic_test(
    device_id: String,
    state: State<'_, AudioState>,
    app: AppHandle,
) -> Result<(), String> {
    let (device, supported_config) =
        get_device_by_id(&device_id).map_err(|e| e.to_string())?;
    let sample_rate = supported_config.sample_rate().0;

    let tmp_path = std::env::temp_dir()
        .join("voicesync_mic_test.wav")
        .to_string_lossy()
        .to_string();

    let mut wav = create_wav_writer(&tmp_path, sample_rate, 1).map_err(|e| e.to_string())?;
    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();

    let app_clone = app.clone();
    let stream_config = supported_config.config();

    std::thread::spawn(move || {
        let err_fn = |e| eprintln!("stream error: {e}");
        let stream = match supported_config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    let level = rms_level(data);
                    let _ = app_clone.emit("audio-level", level);
                    for &s in data {
                        let _ = wav.write_sample(f32_to_i16(s));
                    }
                },
                err_fn,
                None,
            ),
            _ => return,
        };
        if let Ok(s) = stream {
            s.play().ok();
            // Block until stop signal
            let rt = tokio::runtime::Builder::new_current_thread().build().unwrap();
            rt.block_on(async { stop_rx.await.ok() });
        }
    });

    *state.mic_test.lock().unwrap() = Some(MicTestHandle {
        stop_tx,
        output_path: tmp_path,
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_mic_test(state: State<'_, AudioState>) -> Result<String, String> {
    let handle = state
        .mic_test
        .lock()
        .unwrap()
        .take()
        .ok_or("no mic test running")?;
    let path = handle.output_path.clone();
    let _ = handle.stop_tx.send(());
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    Ok(path)
}

#[tauri::command]
pub fn play_mic_test() -> Result<(), String> {
    let path = std::env::temp_dir().join("voicesync_mic_test.wav");
    if !path.exists() {
        return Err("no mic test recording found".into());
    }
    // Use the system default player via a shell command (cross-platform fallback)
    #[cfg(target_os = "macos")]
    std::process::Command::new("afplay")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("powershell")
        .args(["-c", &format!("(New-Object Media.SoundPlayer '{}').PlaySync()", path.display())])
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("aplay")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Recording ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_recording(
    config: RecordingConfig,
    state: State<'_, AudioState>,
    app: AppHandle,
) -> Result<(), String> {
    // Ensure output directory exists
    if let Some(parent) = Path::new(&config.output_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let (device, supported_config) =
        get_device_by_id(&config.device_id).map_err(|e| e.to_string())?;
    let sample_rate = supported_config.sample_rate().0;
    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    let (beep_tx, beep_rx) = mpsc::channel::<BeepParams>();

    let output_path = config.output_path.clone();
    let app_clone = app.clone();
    let beep_interval_sec = config.beep_interval_sec;
    let beep_freq_hz = config.beep_freq_hz;
    let beep_duration_sec = config.beep_duration_sec;
    let stream_config = supported_config.config();
    let output_path_thread = output_path.clone();

    std::thread::spawn(move || {
        let mut wav = match create_wav_writer(&output_path_thread, sample_rate, 1) {
            Ok(w) => w,
            Err(e) => { eprintln!("wav open error: {e}"); return; }
        };

        // Pending beep samples to mix into next chunk
        let pending_beep: std::sync::Arc<std::sync::Mutex<Option<Vec<i16>>>> =
            std::sync::Arc::new(std::sync::Mutex::new(None));
        let pending_beep_clone = pending_beep.clone();

        let err_fn = |e| eprintln!("stream error: {e}");
        let app_c2 = app_clone.clone();
        let stream = match supported_config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    let level = rms_level(data);
                    let _ = app_c2.emit("audio-level", level);
                    let mut pcm: Vec<i16> = data.iter().map(|&s| f32_to_i16(s)).collect();

                    // Mix in any pending beep
                    if let Ok(mut guard) = pending_beep_clone.lock() {
                        if let Some(beep_samples) = guard.take() {
                            for (i, &b) in beep_samples.iter().enumerate() {
                                if i < pcm.len() {
                                    pcm[i] = pcm[i].saturating_add(b);
                                }
                            }
                        }
                    }

                    for s in &pcm {
                        let _ = wav.write_sample(*s);
                    }
                },
                err_fn,
                None,
            ),
            _ => return,
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => { eprintln!("stream build error: {e}"); return; }
        };
        stream.play().ok();

        // Scheduled beep timer (runs in this thread via a channel)
        let app_c3 = app_clone.clone();
        let pending_beep_sched = pending_beep.clone();
        let beep_id_counter = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let counter_clone = beep_id_counter.clone();

        std::thread::spawn(move || {
            let interval = std::time::Duration::from_secs(beep_interval_sec);
            loop {
                std::thread::sleep(interval);
                let beep = generate_beep_i16(beep_freq_hz, beep_duration_sec, sample_rate);
                if let Ok(mut g) = pending_beep_sched.lock() {
                    *g = Some(beep);
                }
                let id = counter_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let _ = app_c3.emit("beep-fired", format!("sched_{id}"));
            }
        });

        // Process manual beep injections from UI
        let pending_beep_manual = pending_beep.clone();
        std::thread::spawn(move || {
            for params in beep_rx {
                let beep = generate_beep_i16(params.freq_hz, params.duration_sec, params.sample_rate);
                if let Ok(mut g) = pending_beep_manual.lock() {
                    *g = Some(beep);
                }
            }
        });

        let rt = tokio::runtime::Builder::new_current_thread().build().unwrap();
        rt.block_on(async { stop_rx.await.ok() });
    });

    *state.recording.lock().unwrap() = Some(RecordingHandle {
        stop_tx,
        output_path: output_path.clone(),
        beep_tx,
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_recording(state: State<'_, AudioState>) -> Result<String, String> {
    let handle = state
        .recording
        .lock()
        .unwrap()
        .take()
        .ok_or("no recording active")?;
    let path = handle.output_path.clone();
    let _ = handle.stop_tx.send(());
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    Ok(path)
}

// ── Beep ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn play_beep(freq_hz: f32, duration_sec: f32) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use std::sync::atomic::{AtomicUsize, Ordering};

    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or("no output device")?;
    let config = device.default_output_config().map_err(|e| e.to_string())?;
    let sample_rate = config.sample_rate().0;
    let beep = generate_beep_i16(freq_hz, duration_sec, sample_rate);
    let beep_arc = std::sync::Arc::new(beep);
    let pos = std::sync::Arc::new(AtomicUsize::new(0));

    let beep_clone = beep_arc.clone();
    let pos_clone = pos.clone();
    let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let done_clone = done.clone();

    let stream_config = config.config();
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_output_stream(
            &stream_config,
            move |data: &mut [f32], _| {
                for d in data.iter_mut() {
                    let idx = pos_clone.fetch_add(1, Ordering::SeqCst);
                    if idx < beep_clone.len() {
                        *d = beep_clone[idx] as f32 / i16::MAX as f32;
                    } else {
                        *d = 0.0;
                        done_clone.store(true, Ordering::SeqCst);
                    }
                }
            },
            |e| eprintln!("output stream error: {e}"),
            None,
        ),
        _ => return Err("unsupported output format".into()),
    }
    .map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    let total_ms = (duration_sec * 1000.0) as u64 + 100;
    std::thread::sleep(std::time::Duration::from_millis(total_ms));
    Ok(())
}

#[tauri::command]
pub fn inject_beep_into_recording(state: State<'_, AudioState>) -> Result<(), String> {
    let guard = state.recording.lock().unwrap();
    let handle = guard.as_ref().ok_or("no recording active")?;
    // The sample rate is stored during start_recording; use a default for the channel msg
    // The writer thread reads sample_rate from the actual WAV spec
    let _ = handle.beep_tx.send(BeepParams {
        freq_hz: 1000.0,
        duration_sec: 1.0,
        sample_rate: 48000,
    });
    Ok(())
}

// ── croc ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_croc_send(
    file_path: String,
    code: String,
    app: AppHandle,
) -> Result<(), String> {
    crate::croc::send_file(file_path, code, app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_croc_recv(output_dir: String, app: AppHandle) -> Result<String, String> {
    crate::croc::recv_files(output_dir, app).await.map_err(|e| e.to_string())
}

// ── Utilities ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_disk_space(path: String) -> Result<DiskSpace, String> {
    // Use statvfs on Unix, GetDiskFreeSpaceEx on Windows
    #[cfg(unix)]
    {
        use std::ffi::CString;
        let c_path = CString::new(path).map_err(|e| e.to_string())?;
        let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
        let ret = unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) };
        if ret != 0 {
            return Err("statvfs failed".into());
        }
        Ok(DiskSpace {
            free: (stat.f_bavail as u64) * (stat.f_frsize as u64),
            total: (stat.f_blocks as u64) * (stat.f_frsize as u64),
        })
    }
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use winapi::um::fileapi::GetDiskFreeSpaceExW;
        use winapi::um::winnt::ULARGE_INTEGER;
        let wide: Vec<u16> = OsStr::new(&path).encode_wide().chain(Some(0)).collect();
        let mut free = ULARGE_INTEGER::default();
        let mut total = ULARGE_INTEGER::default();
        let ret = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), std::ptr::null_mut(), &mut total, &mut free) };
        if ret == 0 { return Err("GetDiskFreeSpaceExW failed".into()); }
        Ok(DiskSpace {
            free: unsafe { *free.QuadPart() },
            total: unsafe { *total.QuadPart() },
        })
    }
}

#[tauri::command]
pub fn get_default_output_path(session_name: String, participant_name: String) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("no home dir")?;
    let safe_session: String = session_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let safe_name: String = participant_name
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let dir = home.join("Podcasts").join(&safe_session).join("raw");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir
        .join(format!("{safe_name}.wav"))
        .to_string_lossy()
        .to_string())
}
