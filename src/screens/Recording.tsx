import { useState, useEffect, useRef, useCallback } from "react";
import { useSessionStore } from "../stores/session";
import { useRecordingStore } from "../stores/recording";
import {
  updateMyStatus,
  subscribeParticipants,
  subscribeEvents,
  subscribeBeepCount,
  pushEvent,
  setSessionPhase,
  incrementBeepCount,
} from "../lib/firebase";
import {
  startRecording,
  stopRecording,
  injectBeepIntoRecording,
  playBeep,
  onAudioLevel,
  onBeepFired,
  getDiskSpace,
  getDefaultOutputPath,
} from "../lib/tauri";

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  // Subscribe to participants and events
  useEffect(() => {
    if (!store.sessionId) return;
    const unsubP = subscribeParticipants(store.sessionId, store.setParticipants);
    const unsubE = subscribeEvents(store.sessionId, async (ev) => {
      if (ev.type === "stop_all") {
        await handleStop();
      }
      if (ev.type === "beep" && store.role === "participant") {
        // Host fired a manual beep — it'll come through the call mic, just log
      }
    });
    const unsubB = subscribeBeepCount(store.sessionId, store.setBeepCount);
    return () => { unsubP(); unsubE(); unsubB(); };
  }, [store.sessionId]);

  // Audio level + beep events from Rust
  useEffect(() => {
    const unsubLevel = onAudioLevel((lvl) => recStore.setAudioLevel(lvl));
    const unsubBeep = onBeepFired(async (beepId) => {
      setLocalBeepCount((c) => c + 1);
      if (store.sessionId) {
        const newCount = store.beepCount + 1;
        await pushEvent(store.sessionId, "beep", { beep_id: beepId });
        await incrementBeepCount(store.sessionId, newCount);
        store.setBeepCount(newCount);
      }
    });
    return () => {
      unsubLevel.then((fn) => fn());
      unsubBeep.then((fn) => fn());
    };
  }, [store.beepCount, store.sessionId]);

  // Tick: elapsed + next-beep countdown
  useEffect(() => {
    if (!isRecording) return;
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);

      nextBeepRef.current -= 1;
      if (nextBeepRef.current <= 0) {
        nextBeepRef.current = store.config.beep_interval_sec;
      }
      setNextBeepIn(nextBeepRef.current);

      // Approximate file size: sample_rate * channels * (bit_depth/8) bytes/sec
      const bytesPerSec = store.config.sample_rate * store.config.channels * (store.config.bit_depth / 8);
      recStore.setFileSizeBytes(elapsedRef.current * bytesPerSec);
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

    getDiskSpace(outputPath).then((space) => recStore.setDiskFreeBytes(space.free));
  }, [store, recStore]);

  const handleStop = useCallback(async () => {
    if (!isRecording && !store.sessionId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const filePath = await stopRecording();
    store.setOutputFilePath(filePath);
    if (store.sessionId && store.myParticipantId) {
      await updateMyStatus(store.sessionId, store.myParticipantId, "stopped");
    }
    if (store.role === "host" && store.sessionId) {
      await pushEvent(store.sessionId, "stop_all", {});
      await setSessionPhase(store.sessionId, "stopped");
    }
    setIsRecording(false);
    store.setScreen("post-session");
  }, [isRecording, store]);

  const handleManualBeep = useCallback(async () => {
    if (!store.sessionId || store.role !== "host") return;
    await playBeep(store.config.beep_freq_hz, store.config.beep_duration_sec);
    await injectBeepIntoRecording();
    await pushEvent(store.sessionId, "beep", { triggered_by: store.myParticipantId });
  }, [store]);

  const vuPercent = Math.round(recStore.audioLevel * 100);

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{store.sessionName || "Recording"}</h2>
        <span className="text-xs font-mono text-gray-400">{store.sessionId}</span>
      </div>

      {/* Timer */}
      <div className="text-center">
        <span
          className={`text-6xl font-mono font-bold tabular-nums ${
            isRecording ? "text-red-400" : "text-gray-400"
          }`}
        >
          {formatTime(elapsed)}
        </span>
        {isRecording && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-gray-400">REC</span>
          </div>
        )}
      </div>

      {/* VU meter */}
      <div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-75"
            style={{ width: `${vuPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-right">
          {formatBytes(recStore.fileSizeBytes)} recorded
        </p>
      </div>

      {/* Beep info */}
      {isRecording && (
        <div className="bg-gray-900 rounded-lg p-3 flex justify-between text-sm">
          <div>
            <p className="text-gray-400 text-xs">Beeps fired</p>
            <p className="font-semibold">{localBeepCount}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs">Next auto-beep</p>
            <p className="font-semibold font-mono">{formatTime(nextBeepIn)}</p>
          </div>
        </div>
      )}

      {/* Participants */}
      {store.role === "host" && (
        <div>
          <p className="text-xs text-gray-400 mb-2">Participants</p>
          <div className="flex flex-col gap-1">
            {Object.entries(store.participants).map(([id, p]) => (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    p.status === "recording"
                      ? "bg-red-400"
                      : p.status === "ready"
                      ? "bg-yellow-400"
                      : p.status === "stopped"
                      ? "bg-gray-500"
                      : p.status === "disconnected"
                      ? "bg-red-800"
                      : "bg-green-400"
                  }`}
                />
                <span>{p.name}</span>
                <span className="text-gray-500 text-xs ml-auto">{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        {!isRecording ? (
          <button
            onClick={handleStart}
            className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold text-lg transition-colors"
          >
            Record
          </button>
        ) : (
          <>
            {store.role === "host" && (
              <button
                onClick={handleManualBeep}
                className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-medium transition-colors"
              >
                Sync now (manual beep)
              </button>
            )}
            <button
              onClick={handleStop}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
            >
              Stop recording
            </button>
          </>
        )}
      </div>

      {recStore.diskFreeBytes > 0 && recStore.diskFreeBytes < 5 * 1024 * 1024 * 1024 && (
        <p className="text-yellow-400 text-xs text-center">
          Low disk space: {formatBytes(recStore.diskFreeBytes)} free
        </p>
      )}
    </div>
  );
}
