import { useState, useEffect } from "react";
import { useSessionStore } from "../stores/session";
import {
  pushEvent,
  setSessionPhase,
  subscribeEvents,
} from "../lib/firebase";
import {
  startCrocSend,
  startCrocRecv,
  onCrocProgress,
  onCrocDone,
} from "../lib/tauri";

export default function PostSession() {
  const store = useSessionStore();
  const [crocProgress, setCrocProgress] = useState<string[]>([]);
  const [crocDone, setCrocDone] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState<string[]>([]);
  const [localCrocCode, setLocalCrocCode] = useState<string | null>(null);

  // Host: start croc recv, broadcast code
  useEffect(() => {
    if (store.role !== "host" || !store.sessionId || !store.outputFilePath) return;

    const outputDir = store.outputFilePath.replace(/\/[^/]+$/, ""); // parent dir
    startCrocRecv(outputDir)
      .then((code) => {
        setLocalCrocCode(code);
        store.setCrocCode(code);
        return pushEvent(store.sessionId!, "croc_code", { code });
      })
      .catch(console.error);

    const unsub = onCrocDone((filePath) => {
      setReceivedFiles((prev) => [...prev, filePath]);
    });
    const unsubProg = onCrocProgress((msg) => {
      setCrocProgress((prev) => [...prev.slice(-10), msg]);
    });
    const unsubDone = onCrocDone(() => setCrocDone(true));

    return () => {
      unsub.then((fn) => fn());
      unsubProg.then((fn) => fn());
      unsubDone.then((fn) => fn());
    };
  }, [store.role, store.sessionId, store.outputFilePath]);

  // Participant: listen for croc progress/done events
  useEffect(() => {
    if (store.role !== "participant") return;
    const unsubProg = onCrocProgress((msg) => setCrocProgress((p) => [...p.slice(-10), msg]));
    const unsubDone = onCrocDone(() => setCrocDone(true));
    return () => {
      unsubProg.then((fn) => fn());
      unsubDone.then((fn) => fn());
    };
  }, [store.role]);

  // Participant: wait for croc_code event from host
  useEffect(() => {
    if (store.role !== "participant" || !store.sessionId) return;
    const unsub = subscribeEvents(store.sessionId, (ev) => {
      if (ev.type === "croc_code") {
        store.setCrocCode(ev.payload.code as string);
      }
    });
    return unsub;
  }, [store.role, store.sessionId]);

  const handleSendFile = async () => {
    if (!store.outputFilePath || !store.crocCode) return;
    await startCrocSend(store.outputFilePath, store.crocCode);
    // Completion is signalled via the croc-done event; setCrocDone set in useEffect
  };

  const handleFinish = async () => {
    if (store.role === "host" && store.sessionId) {
      await setSessionPhase(store.sessionId, "collecting");
    }
    store.reset();
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm">
      <h2 className="text-xl font-semibold">Session complete</h2>

      {store.outputFilePath && (
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Your recording</p>
          <p className="font-mono text-sm text-green-400 break-all">
            {store.outputFilePath}
          </p>
        </div>
      )}

      {store.role === "host" ? (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">
              croc receive code (auto-sent to participants)
            </p>
            {localCrocCode ? (
              <p className="font-mono text-lg text-brand-500">{localCrocCode}</p>
            ) : (
              <p className="text-gray-500 text-sm">Starting croc receiver…</p>
            )}
          </div>

          {receivedFiles.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">
                Received ({receivedFiles.length})
              </p>
              {receivedFiles.map((f) => (
                <p key={f} className="font-mono text-xs text-green-400 break-all">
                  {f}
                </p>
              ))}
            </div>
          )}

          {crocProgress.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-400 max-h-32 overflow-y-auto">
              {crocProgress.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

          <p className="text-sm text-gray-400">
            After collecting all files, run the merge tool:
          </p>
          <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-300">
            cd ~/Podcasts/{store.sessionName || "session"}/
            <br />
            python merge/merge.py --session .
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-400">
            Send your recording to the host using croc.
          </p>
          {store.crocCode ? (
            <>
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Host's croc code</p>
                <p className="font-mono text-lg text-brand-500">{store.crocCode}</p>
              </div>
              <button
                onClick={handleSendFile}
                disabled={crocDone}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 rounded-lg font-semibold transition-colors"
              >
                {crocDone ? "Sent!" : "Send file to host"}
              </button>
              {crocProgress.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-400">
                  {crocProgress.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              Waiting for host to set up croc…
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleFinish}
        className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
      >
        Done — back to home
      </button>
    </div>
  );
}
