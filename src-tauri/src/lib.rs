mod audio;
mod commands;
mod croc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize shared audio state
            app.manage(audio::AudioState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_audio_devices,
            commands::start_mic_test,
            commands::stop_mic_test,
            commands::play_mic_test,
            commands::start_recording,
            commands::stop_recording,
            commands::play_beep,
            commands::inject_beep_into_recording,
            commands::start_croc_send,
            commands::start_croc_recv,
            commands::get_disk_space,
            commands::get_default_output_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
