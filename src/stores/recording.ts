import { create } from "zustand";

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  elapsedSec: number;
  fileSizeBytes: number;
  diskFreeBytes: number;
  audioLevel: number; // 0.0–1.0 for VU meter
  beepsFired: number;
  nextBeepInSec: number;
  deviceId: string | null;
  deviceName: string | null;

  setIsRecording: (v: boolean) => void;
  setIsPaused: (v: boolean) => void;
  setElapsedSec: (v: number) => void;
  setFileSizeBytes: (v: number) => void;
  setDiskFreeBytes: (v: number) => void;
  setAudioLevel: (v: number) => void;
  setBeepsFired: (v: number) => void;
  setNextBeepInSec: (v: number) => void;
  setDevice: (id: string, name: string) => void;
  reset: () => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  isRecording: false,
  isPaused: false,
  elapsedSec: 0,
  fileSizeBytes: 0,
  diskFreeBytes: 0,
  audioLevel: 0,
  beepsFired: 0,
  nextBeepInSec: 0,
  deviceId: null,
  deviceName: null,

  setIsRecording: (isRecording) => set({ isRecording }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setElapsedSec: (elapsedSec) => set({ elapsedSec }),
  setFileSizeBytes: (fileSizeBytes) => set({ fileSizeBytes }),
  setDiskFreeBytes: (diskFreeBytes) => set({ diskFreeBytes }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setBeepsFired: (beepsFired) => set({ beepsFired }),
  setNextBeepInSec: (nextBeepInSec) => set({ nextBeepInSec }),
  setDevice: (deviceId, deviceName) => set({ deviceId, deviceName }),
  reset: () =>
    set({
      isRecording: false,
      isPaused: false,
      elapsedSec: 0,
      fileSizeBytes: 0,
      diskFreeBytes: 0,
      audioLevel: 0,
      beepsFired: 0,
      nextBeepInSec: 0,
    }),
}));
