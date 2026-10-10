import { all, get, newId, run } from "./db";
import { logLockOnce } from "./lock";

// Server-authoritative focus timing. The browser never tells us "I studied 25 minutes". Instead:
//  - startRun()  creates a run with a planned length,
//  - beat()      is called every ~10 s by the page and credits the elapsed time ONLY while the timer is running,
//  - finishRun() COMPLETE succeeds only once enough credited time has accumulated; STOP of a locked run
//                needs a recent unlock code. Study time is written to the stats from credited time only.

export const BEAT_MAX_GAP_MS = 40_000; // longer silence than this earns no credit (app killed, PC asleep, offline…)
export const COMPLETE_TOLERANCE_SEC = 4;
export const STOP_CODE_WINDOW_MS = 120_000;

type Run = {
  id: string; userId: string; subject: string; plannedSec: number; creditedSec: number;
  startedAt: number; lastBeat: number; state: string; locked: number;
};

const activeRun = (userId: string, id: string) =>
  get<Run>("SELECT * FROM FocusRun WHERE id = ? AND userId = ? AND state = 'ACTIVE'", id, userId);

async function closeRun(r: Run, state: "DONE" | "ABORTED", credited: number, now: number) {
  await run("UPDATE FocusRun SET state = ?, creditedSec = ?, endedAt = ? WHERE id = ?", state, credited, now, r.id);
  const secs = Math.round(Math.min(credited, r.plannedSec));
  if (secs >= 10) {
    await run(
      "INSERT INTO StudySession (id, userId, kind, subject, seconds, startedAt) VALUES (?,?,?,?,?,?)",
      newId(), r.userId, "FOCUS", r.subject, secs, r.startedAt,
    );
  }
}

/** Starts a run. Any run left open from before (app killed, reload…) is closed with the time it earned. */
export async function startRun(userId: string, subject: string, plannedSec: number, locked: boolean, now = Date.now()) {
  for (const old of await all<Run>("SELECT * FROM FocusRun WHERE userId = ? AND state = 'ACTIVE'", userId)) await closeRun(old, "ABORTED", old.creditedSec, now);
  const id = newId();
  const planned = Math.max(60, Math.min(6 * 3600, Math.floor(plannedSec)));
  await run(
    "INSERT INTO FocusRun (id, userId, subject, plannedSec, startedAt, lastBeat, locked) VALUES (?,?,?,?,?,?,?)",
    id, userId, subject.trim().slice(0, 40) || "General", planned, now, now, locked ? 1 : 0,
  );
  return { id, plannedSec: planned };
}

async function applyBeat(r: Run, running: boolean, now: number) {
  const gap = now - r.lastBeat;
  let credited = r.creditedSec;
  if (running) {
    if (gap <= BEAT_MAX_GAP_MS) credited = Math.min(r.plannedSec, credited + Math.max(0, gap) / 1000);
    else await logLockOnce(r.userId, "HEARTBEAT_LOST", 60_000); // contact was lost while the timer claimed to run: no credit
  }
  await run("UPDATE FocusRun SET creditedSec = ?, lastBeat = ? WHERE id = ?", credited, now, r.id);
  return credited;
}

export async function beat(userId: string, id: string, running: boolean, now = Date.now()) {
  const r = await activeRun(userId, id);
  if (!r) return { gone: true as const };
  return { creditedSec: await applyBeat(r, running, now), plannedSec: r.plannedSec };
}

export type FinishResult =
  | { ok: true; creditedSec: number }
  | { ok: false; gone?: boolean; error?: "locked"; creditedSec?: number; plannedSec?: number };

export async function finishRun(userId: string, id: string, mode: "COMPLETE" | "STOP", running: boolean, now = Date.now()): Promise<FinishResult> {
  const r = await activeRun(userId, id);
  if (!r) return { ok: false, gone: true };
  const credited = await applyBeat(r, running, now);

  if (mode === "COMPLETE") {
    if (credited < r.plannedSec - COMPLETE_TOLERANCE_SEC) return { ok: false, creditedSec: credited, plannedSec: r.plannedSec };
    await closeRun(r, "DONE", r.plannedSec, now);
    return { ok: true, creditedSec: r.plannedSec };
  }

  // STOP early: a locked run needs a freshly verified unlock code (the parent/admin code).
  if (r.locked) {
    const code = await get("SELECT 1 AS x FROM LockEvent WHERE userId = ? AND kind = 'UNLOCKED_WITH_CODE' AND at > ?", userId, now - STOP_CODE_WINDOW_MS);
    if (!code) return { ok: false, error: "locked", creditedSec: credited, plannedSec: r.plannedSec };
  }
  await closeRun(r, "ABORTED", credited, now);
  return { ok: true, creditedSec: credited };
}

/** A run started online but finished offline: raise its credit to what the app proved, then close it (one session row). */
export async function settleRunOffline(userId: string, runId: string, creditedSec: number, now = Date.now()) {
  const r = await activeRun(userId, runId);
  if (!r) return false;
  await closeRun(r, "DONE", Math.min(r.plannedSec, Math.max(r.creditedSec, creditedSec)), now);
  return true;
}
