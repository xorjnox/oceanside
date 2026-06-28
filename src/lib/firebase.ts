import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
  serverTimestamp,
  onDisconnect,
  get,
  update,
  type DatabaseReference,
} from "firebase/database";
import type { Participant, SessionConfig } from "../stores/session";

// TODO: Replace with your Firebase project config from
// https://console.firebase.google.com → Project Settings → Your apps → Web app
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  databaseURL: "REPLACE_WITH_YOUR_DATABASE_URL",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── Session lifecycle ──────────────────────────────────────────────────────────

export async function createSession(
  sessionId: string,
  sessionName: string,
  config: SessionConfig,
  hostId: string,
  hostName: string
) {
  const sessionRef = ref(db, `sessions/${sessionId}`);
  await set(sessionRef, {
    session_name: sessionName,
    created_at: serverTimestamp(),
    host_participant_id: hostId,
    config,
    state: { phase: "waiting", beep_count: 0 },
  });
  await joinSession(sessionId, hostId, hostName, "host");
}

export async function joinSession(
  sessionId: string,
  participantId: string,
  name: string,
  role: "host" | "participant"
) {
  const presenceRef = ref(
    db,
    `sessions/${sessionId}/participants/${participantId}`
  );
  const participant: Omit<Participant, "id"> = {
    name,
    role,
    status: "joined",
    joined_at: Date.now(),
    last_heartbeat: Date.now(),
  };
  await set(presenceRef, participant);

  // Auto-clean presence on disconnect
  onDisconnect(presenceRef).update({ status: "disconnected" });

  return presenceRef;
}

export async function getSessionConfig(
  sessionId: string
): Promise<{ config: SessionConfig; hostId: string; sessionName: string } | null> {
  const snap = await get(ref(db, `sessions/${sessionId}`));
  if (!snap.exists()) return null;
  const val = snap.val();
  return {
    config: val.config,
    hostId: val.host_participant_id,
    sessionName: val.session_name,
  };
}

// ── Participant status ─────────────────────────────────────────────────────────

export function updateMyStatus(
  sessionId: string,
  participantId: string,
  status: Participant["status"]
) {
  return update(ref(db, `sessions/${sessionId}/participants/${participantId}`), {
    status,
    last_heartbeat: serverTimestamp(),
  });
}

export function sendHeartbeat(sessionId: string, participantId: string) {
  return update(ref(db, `sessions/${sessionId}/participants/${participantId}`), {
    last_heartbeat: serverTimestamp(),
  });
}

// ── Session phase ──────────────────────────────────────────────────────────────

export function setSessionPhase(
  sessionId: string,
  phase: "waiting" | "recording" | "stopped" | "collecting"
) {
  return update(ref(db, `sessions/${sessionId}/state`), { phase });
}

// ── Events (beeps, start, stop, croc code) ────────────────────────────────────

export type EventType = "beep" | "start_all" | "stop_all" | "croc_code";

export function pushEvent(
  sessionId: string,
  type: EventType,
  payload: Record<string, unknown> = {}
) {
  const eventsRef = ref(db, `sessions/${sessionId}/events`);
  return push(eventsRef, {
    type,
    ts: serverTimestamp(),
    payload,
  });
}

export function incrementBeepCount(sessionId: string, newCount: number) {
  return update(ref(db, `sessions/${sessionId}/state`), {
    beep_count: newCount,
  });
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

export function subscribeParticipants(
  sessionId: string,
  cb: (participants: Record<string, Participant>) => void
): () => void {
  const r = ref(db, `sessions/${sessionId}/participants`);
  const unsub = onValue(r, (snap) => {
    cb((snap.val() as Record<string, Participant>) ?? {});
  });
  return unsub;
}

export function subscribePhase(
  sessionId: string,
  cb: (phase: string) => void
): () => void {
  const r = ref(db, `sessions/${sessionId}/state/phase`);
  const unsub = onValue(r, (snap) => {
    if (snap.exists()) cb(snap.val() as string);
  });
  return unsub;
}

export function subscribeEvents(
  sessionId: string,
  cb: (event: { type: EventType; ts: number; payload: Record<string, unknown> }) => void
): () => void {
  const r = ref(db, `sessions/${sessionId}/events`);
  let initialized = false;
  let knownKeys = new Set<string>();

  const unsub = onValue(r, (snap) => {
    if (!snap.exists()) return;
    const all = snap.val() as Record<string, { type: EventType; ts: number; payload: Record<string, unknown> }>;
    if (!initialized) {
      // On first load, record existing keys but don't fire callbacks for them
      Object.keys(all).forEach((k) => knownKeys.add(k));
      initialized = true;
      return;
    }
    for (const [key, event] of Object.entries(all)) {
      if (!knownKeys.has(key)) {
        knownKeys.add(key);
        cb(event);
      }
    }
  });
  return unsub;
}

export function subscribeBeepCount(
  sessionId: string,
  cb: (count: number) => void
): () => void {
  const r = ref(db, `sessions/${sessionId}/state/beep_count`);
  const unsub = onValue(r, (snap) => {
    if (snap.exists()) cb(snap.val() as number);
  });
  return unsub;
}

export { db, ref, type DatabaseReference };
