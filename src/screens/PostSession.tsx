import { useState, useEffect } from "react";
import { useSessionStore } from "../stores/session";
import { pushEvent, setSessionPhase, subscribeEvents } from "../lib/firebase";
import { startCrocSend, startCrocRecv, onCrocProgress, onCrocDone } from "../lib/tauri";

export default function PostSession() {
  const store = useSessionStore();
  const [crocProgress, setCrocProgress] = useState<string[]>([]);
  const [crocDone, setCrocDone] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState<string[]>([]);
  const [localCrocCode, setLocalCrocCode] = useState<string | null>(null);

  useEffect(() => {
    if (store.role !== "host" || !store.sessionId || !store.outputFilePath) return;
    const outputDir = store.outputFilePath.replace(/\/[^/]+$/, "");
    startCrocRecv(outputDir).then(code => {
      setLocalCrocCode(code);
      store.setCrocCode(code);
      return pushEvent(store.sessionId!, "croc_code", { code });
    }).catch(console.error);

    const unsubDone = onCrocDone(fp => setReceivedFiles(p => [...p, fp]));
    const unsubProg = onCrocProgress(msg => setCrocProgress(p => [...p.slice(-10), msg]));
    const unsubDone2 = onCrocDone(() => setCrocDone(true));
    return () => { unsubDone.then(f => f()); unsubProg.then(f => f()); unsubDone2.then(f => f()); };
  }, [store.role, store.sessionId, store.outputFilePath]);

  useEffect(() => {
    if (store.role !== "participant") return;
    const unsubProg = onCrocProgress(msg => setCrocProgress(p => [...p.slice(-10), msg]));
    const unsubDone = onCrocDone(() => setCrocDone(true));
    return () => { unsubProg.then(f => f()); unsubDone.then(f => f()); };
  }, [store.role]);

  useEffect(() => {
    if (store.role !== "participant" || !store.sessionId) return;
    return subscribeEvents(store.sessionId, ev => {
      if (ev.type === "croc_code") store.setCrocCode(ev.payload.code as string);
    });
  }, [store.role, store.sessionId]);

  const handleFinish = async () => {
    if (store.role === "host" && store.sessionId)
      await setSessionPhase(store.sessionId, "collecting");
    store.reset();
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm">
      <h2 className="text-xl font-bold text-ocean-900">session complete</h2>

      {store.outputFilePath && (
        <div className="glass-card p-4">
          <p className="label">your recording</p>
          <p className="font-mono text-sm text-ocean-600 break-all">{store.outputFilePath}</p>
        </div>
      )}

      {store.role === "host" ? (
        <div className="flex flex-col gap-4">
          <div className="glass-card p-4">
            <p className="label">croc receive code</p>
            {localCrocCode
              ? <p className="font-mono text-lg text-ocean-600 font-bold">{localCrocCode}</p>
              : <p className="text-ocean-300 text-sm">starting croc receiver…</p>
            }
          </div>

          {receivedFiles.length > 0 && (
            <div className="glass-card p-4">
              <p className="label">received ({receivedFiles.length})</p>
              {receivedFiles.map(f => <p key={f} className="font-mono text-xs text-emerald-600 break-all">{f}</p>)}
            </div>
          )}

          {crocProgress.length > 0 && (
            <div className="glass-card p-3 font-mono text-xs text-ocean-400 max-h-28 overflow-y-auto">
              {crocProgress.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}

          <div className="glass-card p-4">
            <p className="label">merge tool</p>
            <pre className="font-mono text-xs text-ocean-700 whitespace-pre-wrap">
{`cd ~/Podcasts/${store.sessionName || "session"}/
python merge/merge.py --session .`}
            </pre>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ocean-500">send your recording to the host using croc.</p>
          {store.crocCode ? (
            <>
              <div className="glass-card p-4">
                <p className="label">host's croc code</p>
                <p className="font-mono text-lg text-ocean-600 font-bold">{store.crocCode}</p>
              </div>
              <button
                onClick={() => store.outputFilePath && store.crocCode && startCrocSend(store.outputFilePath, store.crocCode)}
                disabled={crocDone}
                className="btn-primary w-full">
                {crocDone ? "✓ sent!" : "send file to host"}
              </button>
              {crocProgress.length > 0 && (
                <div className="glass-card p-3 font-mono text-xs text-ocean-400">
                  {crocProgress.map((l, i) => <p key={i}>{l}</p>)}
                </div>
              )}
            </>
          ) : (
            <p className="text-ocean-300 text-sm">waiting for host to set up croc…</p>
          )}
        </div>
      )}

      <button onClick={handleFinish} className="btn-secondary w-full text-sm">
        done — back to home
      </button>
    </div>
  );
}
