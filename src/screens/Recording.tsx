import { useState, useEffect, useRef, useCallback } from "react";
import { useSessionStore } from "../stores/session";
import { useRecordingStore } from "../stores/recording";
import {
  updateMyStatus, subscribeParticipants, subscribeEvents,
  subscribeBeepCount, pushEvent, setSessionPhase, incrementBeepCount,
} from "../lib/firebase";
import {
  startRecording, stopRecording, injectBeepIntoRecording,
  playBeep, onAudioLevel, onBeepFired, getDiskSpace, getDefaultOutputPath,
} from "../lib/tauri";

function fmt(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtBytes(b: number) {
  return b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
}

const toVu = (lvl: number) => {
  if (lvl <= 0) return 0;
  return Math.max(0, Math.min(100, ((20 * Math.log10(lvl) + 60) / 60) * 100));
};

const statusDot: Record<string, string> = {
  recording:    "bg-red-400 animate-pulse",
  ready:        "bg-amber-400",
  joined:       "bg-ocean-300",
  stopped:      "bg-gray-300",
  disconnected: "bg-gray-200",
};

export default function Recording() {
  const store = useSessionStore();
  const recStore = useRecordingStore();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [nextBeepIn, setNextBeepIn] = useState(store.config.beep_interval_sec);
  const [localBeepCount, setLocalBeepCount] = useState(0);
  const elapsedRef = useRef(0);
  const nextBeepRef = useRef(store.config.beep_interval_sec);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!store.sessionId) return;
    const unsubP = subscribeParticipants(store.sessionId, store.setParticipants);
    const unsubE = subscribeEvents(store.sessionId, async ev => {
      if (ev.type === "stop_all") await handleStop();
    });
    const unsubB = subscribeBeepCount(store.sessionId, store.setBeepCount);
    return () => { unsubP(); unsubE(); unsubB(); };
  }, [store.sessionId]);

  useEffect(() => {
    const unsubLevel = onAudioLevel(lvl => recStore.setAudioLevel(lvl));
    const unsubBeep = onBeepFired(async beepId => {
      setLocalBeepCount(c => c + 1);
      if (store.sessionId) {
        const n = store.beepCount + 1;
        await pushEvent(store.sessionId, "beep", { beep_id: beepId });
        await incrementBeepCount(store.sessionId, n);
        store.setBeepCount(n);
      }
    });
    return () => { unsubLevel.then(f => f()); unsubBeep.then(f => f()); };
  }, [store.beepCount, store.sessionId]);

  useEffect(() => {
    if (!isRecording) return;
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      nextBeepRef.current = nextBeepRef.current <= 1 ? store.config.beep_interval_sec : nextBeepRef.current - 1;
      setNextBeepIn(nextBeepRef.current);
      const bps = store.config.sample_rate * store.config.channels * (store.config.bit_depth / 8);
      recStore.setFileSizeBytes(elapsedRef.current * bps);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const handleStart = useCallback(async () => {
    if (!store.sessionId || !store.myParticipantId || !recStore.deviceId) return;
    const outputPath = await getDefaultOutputPath(store.sessionName, store.myName);
    await startRecording({
      device_id: recStore.deviceId,
      output_path: outputPath,
      sample_rate: store.config.sample_rate,
      beep_interval_sec: store.config.beep_interval_sec,
      beep_freq_hz: store.config.beep_freq_hz,
      beep_duration_sec: store.config.beep_duration_sec,
    });
    await updateMyStatus(store.sessionId, store.myParticipantId, "recording");
    setIsRecording(true);
    elapsedRef.current = 0;
    nextBeepRef.current = store.config.beep_interval_sec;
    getDiskSpace(outputPath).then(s => recStore.setDiskFreeBytes(s.free));
  }, [store, recStore]);

  const handleStop = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const filePath = await stopRecording();
    store.setOutputFilePath(filePath);
    if (store.sessionId && store.myParticipantId)
      await updateMyStatus(store.sessionId, store.myParticipantId, "stopped");
    if (store.role === "host" && store.sessionId) {
      await pushEvent(store.sessionId, "stop_all", {});
      await setSessionPhase(store.sessionId, "stopped");
    }
    setIsRecording(false);
    store.setScreen("post-session");
  }, [store]);

  const handleManualBeep = useCallback(async () => {
    if (!store.sessionId || store.role !== "host") return;
    await playBeep(store.config.beep_freq_hz, store.config.beep_duration_sec);
    await injectBeepIntoRecording();
    await pushEvent(store.sessionId, "beep", { triggered_by: store.myParticipantId });
  }, [store]);

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ocean-900 truncate">{store.sessionName || "recording"}</h2>
        <span className="text-xs font-mono text-ocean-300 font-semibold">{store.sessionId}</span>
      </div>

      <div className="glass-card p-6 flex flex-col items-center gap-2">
        <span className={`text-6xl font-bold font-mono tabular-nums tracking-tight ${isRecording ? "text-red-500" : "text-ocean-300"}`}>
          {fmt(elapsed)}
        </span>
        {isRecording && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs font-semibold text-red-400 tracking-widest uppercase">recording</span>
          </div>
        )}
      </div>

      <div className="glass-card px-5 py-4 flex flex-col gap-2">
        <div className="h-2 bg-ocean-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-ocean-300 to-ocean-500 rounded-full transition-all duration-75"
            style={{ width: `${toVu(recStore.audioLevel)}%` }} />
        </div>
        <p className="text-xs text-ocean-300 text-right">{fmtBytes(recStore.fileSizeBytes)} recorded</p>
      </div>

      {isRecording && (
        <div className="glass-card px-5 py-3 flex justify-between">
          <div>
            <p className="text-xs text-ocean-400 font-semibold uppercase tracking-widest">beeps</p>
            <p className="text-2xl font-bold text-ocean-700">{localBeepCount}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ocean-400 font-semibold uppercase tracking-widest">next sync</p>
            <p className="text-2xl font-bold text-ocean-700 font-mono">{fmt(nextBeepIn)}</p>
          </div>
        </div>
      )}

      {store.role === "host" && (
        <div className="glass-card p-4 flex flex-col gap-2">
          {Object.entries(store.participants).map(([id, p]) => (
            <div key={id} className="flex items-center gap-2.5 text-sm">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot[p.status] ?? "bg-gray-300"}`} />
              <span className="font-semibold text-ocean-800">{p.name}</span>
              <span className="text-ocean-300 text-xs ml-auto">{p.status}</span>
            </div>
          ))}
        </div>
      )}

      {!isRecording ? (
        <button onClick={handleStart} className="btn-danger w-full text-lg py-4">
          ⏺ record
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          {store.role === "host" && (
            <button onClick={handleManualBeep} className="btn-secondary w-full text-sm">
              ◈ sync now (manual beep)
            </button>
          )}
          <button onClick={handleStop} className="btn-secondary w-full">
            ■ stop recording
          </button>
        </div>
      )}

      {recStore.diskFreeBytes > 0 && recStore.diskFreeBytes < 5 * 1073741824 && (
        <p className="text-amber-500 text-xs text-center font-semibold">
          low disk space · {fmtBytes(recStore.diskFreeBytes)} free
        </p>
      )}
    </div>
  );
}
