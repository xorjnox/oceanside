import { useState, useEffect } from "react";
import {
  listAudioDevices,
  startMicTest,
  stopMicTest,
  playMicTest,
  onAudioLevel,
  type AudioDevice,
} from "../lib/tauri";
import { useRecordingStore } from "../stores/recording";

type TestState = "idle" | "recording" | "recorded" | "playing";

const toVu = (lvl: number) => {
  if (lvl <= 0) return 0;
  return Math.max(0, Math.min(100, ((20 * Math.log10(lvl) + 60) / 60) * 100));
};

export default function MicTestWidget() {
  const recStore = useRecordingStore();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [testState, setTestState] = useState<TestState>("idle");
  const [countdown, setCountdown] = useState(5);
  const [audioLevel, setAudioLevel] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    listAudioDevices().then(setDevices).catch(console.error);
  }, []);

  useEffect(() => {
    const unsub = onAudioLevel(lvl => {
      setAudioLevel(lvl);
      recStore.setAudioLevel(lvl);
    });
    return () => { unsub.then(fn => fn()); };
  }, []);

  const handleStartTest = async () => {
    if (!recStore.deviceId) return;
    setTestState("recording");
    setCountdown(5);
    await startMicTest(recStore.deviceId);
    let c = 5;
    const timer = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(timer);
        stopMicTest().then(() => setTestState("recorded")).catch(console.error);
      }
    }, 1000);
  };

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-ocean-700 hover:text-ocean-900 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">🎙</span>
          test your mic
        </span>
        <span className="text-ocean-300 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-ocean-100">
          <div className="pt-3">
            <label className="label">input device</label>
            <select className="input-field text-sm" value={recStore.deviceId ?? ""}
              onChange={e => {
                const dev = devices.find(d => d.id === e.target.value);
                if (dev) recStore.setDevice(dev.id, dev.name);
              }}>
              <option value="" disabled>select a mic…</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="h-2 bg-ocean-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-ocean-300 to-ocean-500 rounded-full transition-all duration-75"
              style={{ width: `${toVu(audioLevel)}%` }} />
          </div>

          <div className="flex gap-2">
            <button onClick={handleStartTest}
              disabled={!recStore.deviceId || testState === "recording"}
              className="btn-secondary flex-1 text-xs py-2">
              {testState === "recording" ? `${countdown}s…` : "record 5s"}
            </button>
            <button onClick={async () => { setTestState("playing"); await playMicTest(); setTestState("recorded"); }}
              disabled={testState !== "recorded"}
              className="btn-secondary flex-1 text-xs py-2">
              {testState === "playing" ? "playing…" : "play back"}
            </button>
          </div>

          {testState === "recorded" && (
            <p className="text-xs text-emerald-500 font-semibold text-center">
              ✓ mic sounds good — you're all set
            </p>
          )}
        </div>
      )}
    </div>
  );
}
