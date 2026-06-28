import { useState } from "react";
import { customAlphabet } from "nanoid";
import { useSessionStore } from "../stores/session";
import { joinSession, getSessionConfig, updateMyStatus } from "../lib/firebase";

const nanoid = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 8);

export default function JoinSession() {
  const store = useSessionStore();
  const [sessionId, setSessionIdLocal] = useState("");
  const [myName, setMyNameLocal] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    const id = sessionId.trim().toLowerCase();
    const name = myName.trim();
    if (!id || !name) return;
    setJoining(true);
    setError("");
    try {
      const result = await getSessionConfig(id);
      if (!result) {
        setError("session not found — check the id and try again");
        setJoining(false);
        return;
      }
      const participantId = `p_${nanoid().slice(0, 6)}`;
      store.setSessionId(id);
      store.setSessionName(result.sessionName);
      store.setMyName(name);
      store.setRole("participant");
      store.setMyParticipantId(participantId);
      store.setConfig(result.config);
      await joinSession(id, participantId, name, "participant");
      await updateMyStatus(id, participantId, "joined");
      store.setScreen("mic-test");
    } catch {
      setError("failed to join — check your connection");
      setJoining(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm">
      <div className="flex items-center gap-3">
        <button onClick={() => store.setScreen("home")} className="text-ocean-400 hover:text-ocean-600 transition-colors text-sm font-semibold">
          ← back
        </button>
        <h2 className="text-xl font-bold text-ocean-900">join a session</h2>
      </div>

      <div className="glass-card p-6 flex flex-col gap-4">
        <div>
          <label className="label">session id</label>
          <input className="input-field font-mono tracking-widest" placeholder="pod-x7k2"
            value={sessionId} onChange={e => setSessionIdLocal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleJoin()} />
        </div>
        <div>
          <label className="label">your name</label>
          <input className="input-field" placeholder="Alice"
            value={myName} onChange={e => setMyNameLocal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleJoin()} />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-2.5">
            <p className="text-red-500 text-sm font-medium">{error}</p>
          </div>
        )}

        <button onClick={handleJoin} disabled={joining || !sessionId.trim() || !myName.trim()} className="btn-primary w-full mt-1">
          {joining ? "joining…" : "join →"}
        </button>
      </div>
    </div>
  );
}
