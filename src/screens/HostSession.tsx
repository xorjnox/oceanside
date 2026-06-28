import { useState, useEffect, useCallback } from "react";
import { customAlphabet } from "nanoid";
import QRCode from "qrcode.react";
import { useSessionStore } from "../stores/session";
import MicTestWidget from "../components/MicTestWidget";
import {
  createSession,
  subscribeParticipants,
  setSessionPhase,
  pushEvent,
} from "../lib/firebase";

const nanoid = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 8);
const genSessionId = () => `pod-${nanoid().slice(0, 4)}`;
const genParticipantId = () => `p_${nanoid().slice(0, 6)}`;

const statusColor: Record<string, string> = {
  joined:       "bg-ocean-300",
  ready:        "bg-emerald-400",
  recording:    "bg-red-400",
  stopped:      "bg-gray-300",
  disconnected: "bg-gray-200",
};

export default function HostSession() {
  const store = useSessionStore();
  const [sessionName, setSessionNameLocal] = useState("");
  const [myName, setMyNameLocal] = useState("");
  const [beepInterval, setBeepInterval] = useState(600);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const participants = store.participants;
  const canStart = created && Object.keys(participants).filter(id => id !== store.myParticipantId).length >= 1;

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

  const handleStart = useCallback(async () => {
    if (!store.sessionId) return;
    await setSessionPhase(store.sessionId, "recording");
    await pushEvent(store.sessionId, "start_all", {});
    store.setPhase("recording");
    store.setScreen("mic-test");
  }, [store]);

  useEffect(() => {
    if (!store.sessionId) return;
    return subscribeParticipants(store.sessionId, store.setParticipants);
  }, [store.sessionId]);

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm">
      <div className="flex items-center gap-3">
        <button onClick={() => store.setScreen("home")} className="text-ocean-400 hover:text-ocean-600 transition-colors text-sm font-semibold">
          ← back
        </button>
        <h2 className="text-xl font-bold text-ocean-900">new session</h2>
      </div>

      {!created ? (
        <div className="glass-card p-6 flex flex-col gap-4">
          <div>
            <label className="label">session name</label>
            <input className="input-field" placeholder="Episode 12 — Astrology & Engineering"
              value={sessionName} onChange={e => setSessionNameLocal(e.target.value)} />
          </div>
          <div>
            <label className="label">your name</label>
            <input className="input-field" placeholder="Ranjan"
              value={myName} onChange={e => setMyNameLocal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()} />
          </div>
          <div>
            <label className="label">sync beep every (seconds)</label>
            <input type="number" min={60} max={3600} className="input-field"
              value={beepInterval} onChange={e => setBeepInterval(Number(e.target.value))} />
          </div>
          <button onClick={handleCreate} disabled={creating || !sessionName.trim() || !myName.trim()} className="btn-primary w-full mt-1">
            {creating ? "creating…" : "create session"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="glass-card p-6 flex flex-col items-center gap-4">
            <p className="text-xs font-semibold text-ocean-400 uppercase tracking-widest">session id</p>
            <button onClick={handleCopy} className="text-3xl font-bold font-mono tracking-widest text-ocean-600 hover:text-ocean-500 transition-colors">
              {store.sessionId}
            </button>
            {copyFeedback && <span className="text-xs text-emerald-500 font-semibold">copied!</span>}
            <div className="rounded-2xl overflow-hidden p-2 bg-white/90 shadow-ocean-sm">
              <QRCode value={store.sessionId ?? ""} size={110} fgColor="#0284c7" bgColor="transparent" />
            </div>
            <p className="text-xs text-ocean-400">share this with your co-hosts</p>
          </div>

          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-ocean-400 uppercase tracking-widest mb-3">
              participants ({Object.keys(participants).length})
            </p>
            <div className="flex flex-col gap-2">
              {Object.entries(participants).map(([id, p]) => (
                <div key={id} className="flex items-center gap-3 bg-white/60 rounded-2xl px-3 py-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor[p.status] ?? "bg-gray-300"}`} />
                  <span className="font-semibold text-ocean-800 text-sm">{p.name}</span>
                  {p.role === "host" && <span className="text-xs text-ocean-300 ml-auto font-medium">host</span>}
                </div>
              ))}
            </div>
          </div>

          <MicTestWidget />

          <button onClick={handleStart} disabled={!canStart} className="btn-primary w-full">
            {canStart ? "start session →" : "waiting for someone to join…"}
          </button>
        </div>
      )}
    </div>
  );
}
