import { useSessionStore } from "./stores/session";
import Home from "./screens/Home";
import HostSession from "./screens/HostSession";
import JoinSession from "./screens/JoinSession";
import MicTest from "./screens/MicTest";
import Recording from "./screens/Recording";
import PostSession from "./screens/PostSession";

export type Screen =
  | "home"
  | "host-setup"
  | "join"
  | "mic-test"
  | "recording"
  | "post-session";

export default function App() {
  const screen = useSessionStore((s) => s.screen);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {screen === "home" && <Home />}
      {screen === "host-setup" && <HostSession />}
      {screen === "join" && <JoinSession />}
      {screen === "mic-test" && <MicTest />}
      {screen === "recording" && <Recording />}
      {screen === "post-session" && <PostSession />}
    </div>
  );
}
