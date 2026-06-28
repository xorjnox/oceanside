import { useSessionStore } from "../stores/session";

export default function Home() {
  const setScreen = useSessionStore((s) => s.setScreen);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-sm">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">VoiceSync</h1>
        <p className="text-gray-400 text-sm">Local-first podcast recording</p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={() => setScreen("host-setup")}
          className="w-full py-3 px-6 bg-brand-600 hover:bg-brand-700 rounded-lg font-semibold text-lg transition-colors"
        >
          New session
        </button>
        <button
          onClick={() => setScreen("join")}
          className="w-full py-3 px-6 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold text-lg transition-colors"
        >
          Join session
        </button>
      </div>
    </div>
  );
}
