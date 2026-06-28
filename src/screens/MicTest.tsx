import { useState, useEffect } from "react";
import { useSessionStore } from "../stores/session";
import { useRecordingStore } from "../stores/recording";
import { updateMyStatus, subscribePhase, subscribeEvents } from "../lib/firebase";
import {
  listAudioDevices,
  startMicTest,
  stopMicTest,
  playMicTest,
  onAudioLevel,
  type AudioDevice,
} from "../lib/tauri";

type TestState = "idle" | "recording" | "recorded" | "playing";

const toVu = (lvl: number) => {
  if (lvl <= 0) return 0;
  return Math.max(0, Math.min(100, ((20 * Math.log10(lvl) + 60) / 60) * 100));
};

export default function MicTest() {
  const store = useSessionStore();
  const recStore = useRecordingStore();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [testState, setTestState] = useState<TestState>("idle");
  const [countdown, setCountdown] = useState(5);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    listAudioDevices().then(devs => setDevices(devs)).catch(console.error);
  }, []);

  useEffect(() => {
    const unsub = onAudioLevel(lvl => {
      setAudioLevel(lvl);
      recStore.setAudioLevel(lvl);
    });
    return () => { unsub.then(fn => fn()); };
  }, []);

  useEffect(() => {
    if (!store.sessionId || store.role === "host") return;
    const unsubPhase = subscribePhase(store.sessionId, phase => {
      if (phase === "recording") store.setScreen("recording");
    });
    const unsubEvents = subscribeEvents(store.sessionId, ev => {
      if (ev.type === "start_all") store.setScreen("recording");
    });
    return () => { unsubPhase(); unsubEvents(); };
  }, [store.sessionId, store.role]);

  const handleStartTest = async () => {
    if (!recStore.deviceId) return;
    setError("");
    setTestState("recording");
    setCountdown(5);
    try {
      await startMicTest(recStore.deviceId);
    } catch (e) {
      setTestState("idle");
      setError(`mic access failed: ${e}`);
      return;
    }
    let c = 5;
    const timer = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(timer);
        stopMicTest()
          .then(() => setTestState("recorded"))
          .catch(e => { setTestState("idle"); setError(`recording failed: ${e}`); });
      }
    }, 1000);
  };

  const handlePlayback = async () => {
    setError("");
    setTestState("playing");
    try {
      await playMicTest();
      setTestState("recorded");
    } catch (e) {
      setTestState("recorded");
      setError(`playback failed: ${e}`);
    }
  };

  const handleReady = async () => {
    if (!store.sessionId || !store.myParticipantId) return;
    await updateMyStatus(store.sessionId, store.myParticipantId, "ready");
    if (store.role === "host") store.setScreen("recording");
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm">
      <div className="flex items-center gap-3">
        <button onClick={() => store.setScreen("home")} className="text-ocean-400 hover:text-ocean-600 transition-colors text-sm font-semibold">
          ← back
        </button>
        <h2 className="text-xl font-bold text-ocean-900">mic check</h2>
      </div>

      <div className="glass-card p-5 flex flex-col gap-4">
        <div>
          <label className="label">input device</label>
          <select className="input-field" value={recStore.deviceId ?? ""}
            onChange={e => {
              const d = devices.find(d => d.id === e.target.value);
              if (d) { recStore.setDevice(d.id, d.name); setError(""); }
            }}>
            <option value="" disabled>select a microphone…</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div>
          <div className="h-2.5 bg-ocean-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-ocean-300 to-ocean-500 rounded-full transition-all duration-75"
              style={{ width: `${toVu(audioLevel)}%` }} />
          </div>
          <p className="text-xs text-ocean-300 mt-1">input level</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <p className="text-red-500 text-xs font-medium leading-relaxed">{error}</p>
            {error.includes("mic access") && (
              <p className="text-red-400 text-xs mt-1">
                → System Settings → Privacy & Security → Microphone → enable oceanside
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2.5">
          <button onClick={handleStartTest}
            disabled={!recStore.deviceId || testState === "recording"}
            className="btn-secondary flex-1 text-sm py-2.5">
            {testState === "recording" ? `recording… ${countdown}s` : "test mic (5s)"}
          </button>
          <button onClick={handlePlayback}
            disabled={testState !== "recorded"}
            className="btn-secondary flex-1 text-sm py-2.5">
            {testState === "playing" ? "playing…" : "play back"}
          </button>
        </div>

        {testState === "recorded" && !error && (
          <p className="text-xs text-emerald-500 font-semibold text-center">✓ sounding good</p>
        )}
      </div>

      <button onClick={handleReady} disabled={!recStore.deviceId} className="btn-primary w-full">
        {store.role === "host" ? "go to recording →" : "i'm ready"}
      </button>

      {store.role === "participant" && (
        <p className="text-center text-xs text-ocean-300">
          waiting for host to start ·{" "}
          <span className="font-mono font-semibold">{store.sessionId}</span>
        </p>
      )}
    </div>
  );
}
