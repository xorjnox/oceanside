import { create } from "zustand";
import type { Screen } from "../App";

export interface Participant {
  id: string;
  name: string;
  role: "host" | "participant";
  status: "joined" | "ready" | "recording" | "stopped" | "disconnected";
  joined_at: number;
  last_heartbeat: number;
}

export interface SessionConfig {
  sample_rate: number;
  channels: number;
  bit_depth: number;
  beep_interval_sec: number;
  beep_freq_hz: number;
  beep_duration_sec: number;
}

export interface SessionState {
  screen: Screen;
  sessionId: string | null;
  sessionName: string;
  myParticipantId: string | null;
  myName: string;
  role: "host" | "participant" | null;
  participants: Record<string, Participant>;
  config: SessionConfig;
  phase: "waiting" | "recording" | "stopped" | "collecting";
  beepCount: number;
  crocCode: string | null;
  outputFilePath: string | null;

  setScreen: (screen: Screen) => void;
  setSessionId: (id: string) => void;
  setSessionName: (name: string) => void;
  setMyName: (name: string) => void;
  setRole: (role: "host" | "participant") => void;
  setMyParticipantId: (id: string) => void;
  setParticipants: (p: Record<string, Participant>) => void;
  updateParticipant: (id: string, data: Partial<Participant>) => void;
  setConfig: (config: Partial<SessionConfig>) => void;
  setPhase: (phase: SessionState["phase"]) => void;
  setBeepCount: (n: number) => void;
  setCrocCode: (code: string | null) => void;
  setOutputFilePath: (path: string | null) => void;
  reset: () => void;
}

const DEFAULT_CONFIG: SessionConfig = {
  sample_rate: 48000,
  channels: 1,
  bit_depth: 16,
  beep_interval_sec: 600,
  beep_freq_hz: 1000,
  beep_duration_sec: 1.0,
};

export const useSessionStore = create<SessionState>((set) => ({
  screen: "home",
  sessionId: null,
  sessionName: "",
  myParticipantId: null,
  myName: "",
  role: null,
  participants: {},
  config: DEFAULT_CONFIG,
  phase: "waiting",
  beepCount: 0,
  crocCode: null,
  outputFilePath: null,

  setScreen: (screen) => set({ screen }),
  setSessionId: (sessionId) => set({ sessionId }),
  setSessionName: (sessionName) => set({ sessionName }),
  setMyName: (myName) => set({ myName }),
  setRole: (role) => set({ role }),
  setMyParticipantId: (myParticipantId) => set({ myParticipantId }),
  setParticipants: (participants) => set({ participants }),
  updateParticipant: (id, data) =>
    set((s) => ({
      participants: {
        ...s.participants,
        [id]: { ...s.participants[id], ...data },
      },
    })),
  setConfig: (config) =>
    set((s) => ({ config: { ...s.config, ...config } })),
  setPhase: (phase) => set({ phase }),
  setBeepCount: (beepCount) => set({ beepCount }),
  setCrocCode: (crocCode) => set({ crocCode }),
  setOutputFilePath: (outputFilePath) => set({ outputFilePath }),
  reset: () =>
    set({
      screen: "home",
      sessionId: null,
      sessionName: "",
      myParticipantId: null,
      myName: "",
      role: null,
      participants: {},
      config: DEFAULT_CONFIG,
      phase: "waiting",
      beepCount: 0,
      crocCode: null,
      outputFilePath: null,
    }),
}));
