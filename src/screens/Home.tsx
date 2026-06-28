import { useSessionStore } from "../stores/session";

export default function Home() {
  const setScreen = useSessionStore((s) => s.setScreen);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xs">
      <div className="flex flex-col items-center gap-2">
        <img
          src="/logo-icon.png"
          alt="oceanside mic"
          className="w-40 h-auto object-contain"
          style={{ filter: "drop-shadow(0 8px 28px rgba(14,100,180,0.22))" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <h1 className="text-3xl font-bold tracking-tight text-ocean-800">oceanside</h1>
        <p className="text-ocean-400 text-sm font-light">why settle for a river?</p>
      </div>

      <div className="glass-card w-full p-6 flex flex-col gap-3">
        <button onClick={() => setScreen("host-setup")} className="btn-primary w-full text-base">
          start a session
        </button>
        <button onClick={() => setScreen("join")} className="btn-secondary w-full text-base">
          join a session
        </button>
      </div>
    </div>
  );
}
