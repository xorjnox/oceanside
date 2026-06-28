import { invoke as _invoke } from "@tauri-apps/api/core";
import { listen as _listen } from "@tauri-apps/api/event";

const isTauri = "__TAURI_INTERNALS__" in window;

// When running in a plain browser (handy for testing the signaling flow with a
// second "participant"), Tauri IPC isn't available. Return mock values so the
// UI renders and the join → ready → recording flow still works end-to-end.
const browserStub: Record<string, unknown> = {
  list_audio_devices: [{ id: "browser", name: "Browser (mock mic — no real recording)" }],
  get_default_output_path: "/tmp/oceanside-browser.wav",
  get_disk_space: { free: 0, total: 0 },
  stop_mic_test: "/tmp/oceanside-browser.wav",
  stop_recording: "/tmp/oceanside-browser.wav",
};

const invoke: typeof _invoke = isTauri
  ? _invoke
  : ((cmd: string, ...args: unknown[]) => {
      console.warn(`[browser stub] invoke("${cmd}")`, ...args);
      return Promise.resolve(browserStub[cmd]);
    }) as typeof _invoke;

const listen: typeof _listen = isTauri
  ? _listen
  : (_event, _cb) => Promise.resolve(() => {});

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
  invoke<AudioDevice[]>("list_audio_devices").then((d) => d ?? []);

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
