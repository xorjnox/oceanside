import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface AudioDevice {
  id: string;
  name: string;
}

export interface RecordingConfig {
  device_id: string;
  output_path: string;
  sample_rate: number;
  beep_interval_sec: number;
  beep_freq_hz: number;
  beep_duration_sec: number;
}

export const listAudioDevices = (): Promise<AudioDevice[]> =>
  invoke("list_audio_devices");

export const startMicTest = (deviceId: string): Promise<void> =>
  invoke("start_mic_test", { deviceId });

export const stopMicTest = (): Promise<string> =>
  invoke("stop_mic_test");

export const playMicTest = (): Promise<void> =>
  invoke("play_mic_test");

export const startRecording = (config: RecordingConfig): Promise<void> =>
  invoke("start_recording", { config });

export const stopRecording = (): Promise<string> =>
  invoke("stop_recording");

export const playBeep = (freqHz: number, durationSec: number): Promise<void> =>
  invoke("play_beep", { freqHz, durationSec });

export const injectBeepIntoRecording = (): Promise<void> =>
  invoke("inject_beep_into_recording");

export const startCrocSend = (filePath: string, code: string): Promise<void> =>
  invoke("start_croc_send", { filePath, code });

export const startCrocRecv = (outputDir: string): Promise<string> =>
  invoke("start_croc_recv", { outputDir });

export const getDiskSpace = (path: string): Promise<{ free: number; total: number }> =>
  invoke("get_disk_space", { path });

export const getDefaultOutputPath = (sessionName: string, participantName: string): Promise<string> =>
  invoke("get_default_output_path", { sessionName, participantName });

// Events emitted from Rust
export const onAudioLevel = (cb: (level: number) => void) =>
  listen<number>("audio-level", (e) => cb(e.payload));

export const onBeepFired = (cb: (beepId: string) => void) =>
  listen<string>("beep-fired", (e) => cb(e.payload));

export const onCrocProgress = (cb: (msg: string) => void) =>
  listen<string>("croc-progress", (e) => cb(e.payload));

export const onCrocDone = (cb: (filePath: string) => void) =>
  listen<string>("croc-done", (e) => cb(e.payload));
