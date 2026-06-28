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

export default function MicTest() {
  const store = useSessionStore();
  const recStore = useRecordingStore();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [testState, setTestState] = useState<TestState>("idle");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    listAudioDevices().then(setDevices).catch(console.error);
  }, []);

  useEffect(() => {
    const unsub = onAudioLevel((level) => recStore.setAudioLevel(level));
    return () => { unsub.then((fn) => fn()); };
  }, []);

  // Participants: wait for host start signal then go to recording
  useEffect(() => {
    if (!store.sessionId || store.role === "host") return;
    const unsubPhase = subscribePhase(store.sessionId, (phase) => {
      if (phase === "recording") store.setScreen("recording");
    });
    const unsubEvents = subscribeEvents(store.sessionId, (ev) => {
      if (ev.type === "start_all") store.setScreen("recording");
    });
    return () => { unsubPhase(); unsubEvents(); };
  }, [store.sessionId, store.role]);

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

  const handlePlayback = async () => {
    setTestState("playing");
    await playMicTest();
    setTestState("recorded");
  };

  const handleReady = async () => {
    if (!store.sessionId || !store.myParticipantId) return;
    await updateMyStatus(store.sessionId, store.myParticipantId, "ready");
    if (store.role === "host") {
      store.setScreen("recording");
    }
    // Participants stay on this screen until host fires start_all
  };

  const vuPercent = Math.round(recStore.audioLevel * 100);

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm">
      <h2 className="text-xl font-semibold">Mic test</h2>
      <p className="text-sm text-gray-400">
        Pick your mic, do a 5-second test, then mark yourself ready.
      </p>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Input device</label>
        <select
          className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={recStore.deviceId ?? ""}
          onChange={(e) => {
            const dev = devices.find((d) => d.id === e.target.value);
            if (dev) recStore.setDevice(dev.id, dev.name);
          }}
        >
          <option value="" disabled>
            Select a device…
          </option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* VU meter */}
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all duration-75"
          style={{ width: `${vuPercent}%` }}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleStartTest}
          disabled={!recStore.deviceId || testState === "recording"}
          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
        >
          {testState === "recording"
            ? `Recording… ${countdown}s`
            : "Test mic (5s)"}
        </button>
        <button
          onClick={handlePlayback}
          disabled={testState !== "recorded"}
          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
        >
          {testState === "playing" ? "Playing…" : "Play back"}
        </button>
      </div>

      <button
        onClick={handleReady}
        disabled={!recStore.deviceId}
        className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 rounded-lg font-semibold transition-colors"
      >
        {store.role === "host" ? "Go to recording →" : "Ready — waiting for host"}
      </button>

      {store.role === "participant" && (
        <p className="text-xs text-gray-500 text-center">
          Session: <span className="font-mono">{store.sessionId}</span>
        </p>
      )}
    </div>
  );
}
