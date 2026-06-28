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
        setError("Session not found. Check the ID and try again.");
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
    } catch (e) {
      setError("Failed to join. Check your connection.");
      setJoining(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={() => store.setScreen("home")}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <h2 className="text-xl font-semibold">Join session</h2>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Session ID</label>
          <input
            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
            placeholder="pod-x7k2"
            value={sessionId}
            onChange={(e) => setSessionIdLocal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Your name</label>
          <input
            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Alice"
            value={myName}
            onChange={(e) => setMyNameLocal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={joining || !sessionId.trim() || !myName.trim()}
          className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          {joining ? "Joining…" : "Join →"}
        </button>
      </div>
    </div>
  );
}
