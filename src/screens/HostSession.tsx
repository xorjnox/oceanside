import { useState, useEffect, useCallback } from "react";
import { customAlphabet } from "nanoid";
import QRCode from "qrcode.react";
import { useSessionStore } from "../stores/session";
import {
  createSession,
  subscribeParticipants,
  setSessionPhase,
  pushEvent,
} from "../lib/firebase";

const nanoid = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 8);

function genSessionId(): string {
  return `pod-${nanoid().slice(0, 4)}`;
}

function genParticipantId(): string {
  return `p_${nanoid().slice(0, 6)}`;
}

export default function HostSession() {
  const store = useSessionStore();
  const [sessionName, setSessionNameLocal] = useState("");
  const [myName, setMyNameLocal] = useState("");
  const [beepInterval, setBeepInterval] = useState(600);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const canStart =
    created &&
    Object.keys(store.participants).filter(
      (id) => id !== store.myParticipantId
    ).length >= 1;

  const handleCreate = async () => {
    if (!sessionName.trim() || !myName.trim()) return;
    setCreating(true);
    const sessionId = genSessionId();
    const hostId = genParticipantId();
    const config = { ...store.config, beep_interval_sec: beepInterval };

    store.setSessionId(sessionId);
    store.setSessionName(sessionName.trim());
    store.setMyName(myName.trim());
    store.setRole("host");
    store.setMyParticipantId(hostId);
    store.setConfig(config);

    await createSession(sessionId, sessionName.trim(), config, hostId, myName.trim());
    setCreated(true);
    setCreating(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(store.sessionId ?? "");
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  const handleStartSession = useCallback(async () => {
    if (!store.sessionId) return;
    await setSessionPhase(store.sessionId, "recording");
    await pushEvent(store.sessionId, "start_all", {});
    store.setPhase("recording");
    store.setScreen("mic-test");
  }, [store]);

  useEffect(() => {
    if (!store.sessionId) return;
    const unsub = subscribeParticipants(store.sessionId, (participants) => {
      store.setParticipants(participants);
    });
    return unsub;
  }, [store.sessionId]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-md">
      <div className="flex items-center gap-3">
        <button
          onClick={() => store.setScreen("home")}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <h2 className="text-xl font-semibold">New session</h2>
      </div>

      {!created ? (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Session name</label>
            <input
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Episode 12 — Astrology and Engineering"
              value={sessionName}
              onChange={(e) => setSessionNameLocal(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Your name</label>
            <input
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Ranjan"
              value={myName}
              onChange={(e) => setMyNameLocal(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Sync beep interval (seconds)
            </label>
            <input
              type="number"
              min={60}
              max={3600}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={beepInterval}
              onChange={(e) => setBeepInterval(Number(e.target.value))}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !sessionName.trim() || !myName.trim()}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
          >
            {creating ? "Creating…" : "Create session"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="bg-gray-900 rounded-xl p-5 flex flex-col items-center gap-4">
            <p className="text-sm text-gray-400">Session ID — share this</p>
            <button
              onClick={handleCopy}
              className="text-4xl font-mono font-bold tracking-widest text-brand-500 hover:text-brand-400 transition-colors"
            >
              {store.sessionId}
            </button>
            {copyFeedback && (
              <span className="text-xs text-green-400">Copied!</span>
            )}
            <QRCode value={store.sessionId ?? ""} size={120} fgColor="#d946ef" bgColor="#111827" />
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">
              Participants ({Object.keys(store.participants).length})
            </p>
            <div className="flex flex-col gap-2">
              {Object.entries(store.participants).map(([id, p]) => (
                <div
                  key={id}
                  className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2"
                >
                  <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="font-medium">{p.name}</span>
                  {p.role === "host" && (
                    <span className="text-xs text-gray-500 ml-auto">host</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartSession}
            disabled={!canStart}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
          >
            {canStart
              ? "Start session →"
              : "Waiting for participants to join…"}
          </button>
        </div>
      )}
    </div>
  );
}
