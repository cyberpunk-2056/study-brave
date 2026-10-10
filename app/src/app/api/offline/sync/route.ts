import { createHmac, timingSafeEqual } from "node:crypto";
import { get, newId, run } from "@/lib/db";
import { isDesktopRequest } from "@/lib/desktop";
import { settleRunOffline } from "@/lib/focus";
import { CLIENT_EVENT_KINDS, logLock, type LockEventKind } from "@/lib/lock";
import { getUser } from "@/lib/session";

// Receives study sessions that were recorded while the PC had no internet.
// Trust model: the record must be signed by the desktop app (a key only the app has), belong to the logged-in
// student, and is credited with the time the app measured on its own monotonic clock, never more than the planned
// length and never more than the wall-clock time between start and end. Each clientId is accepted once.

type Rec = {
  clientId: string; userId: string; kind: string; subject: string; startedAt: number;
  plannedSec: number; runSec: number; wallSec: number; violations: number; runId: string | null; sig: string;
};
type Ev = { kind: LockEventKind; at: number };

const DAY = 86400_000;

function signatureOk(r: Rec) {
  const key = process.env.DESKTOP_APP_KEY;
  if (!key || typeof r.sig !== "string") return false;
  const data = [r.clientId, r.userId, r.kind, r.subject, r.startedAt, r.plannedSec, r.runSec, r.wallSec, r.violations, r.runId ?? ""].join("|");
  const want = createHmac("sha256", key).update(data).digest("hex");
  return want.length === r.sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(r.sig));
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  if (!isDesktopRequest(req.headers)) return Response.json({ error: "Desktop app only" }, { status: 403 });

  let body: { sessions?: Rec[]; events?: Ev[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const now = Date.now();
  const results: { clientId: string; ok: boolean; creditedSec: number; flagged?: boolean; reason?: string }[] = [];

  for (const r of (body.sessions ?? []).slice(0, 100)) {
    const reject = async (reason: string) => {
      results.push({ clientId: String(r?.clientId ?? ""), ok: false, creditedSec: 0, reason });
      await logLock(user.id, "OFFLINE_FLAGGED");
    };
    if (!r || typeof r.clientId !== "string" || !/^[\w-]{8,64}$/.test(r.clientId)) {
      results.push({ clientId: "", ok: false, creditedSec: 0, reason: "bad record" });
      continue;
    }
    const seen = await get<{ creditedSec: number; flagged: number }>("SELECT creditedSec, flagged FROM OfflineSync WHERE clientId = ?", r.clientId);
    if (seen) {
      results.push({ clientId: r.clientId, ok: true, creditedSec: seen.creditedSec, flagged: !!seen.flagged, reason: "already synced" });
      continue;
    }
    if (r.userId !== user.id) { await reject("belongs to another account"); continue; }
    if (r.kind !== "FOCUS") { await reject("unsupported kind"); continue; }
    if (!signatureOk(r)) { await reject("invalid signature"); continue; }
    if ([r.startedAt, r.plannedSec, r.runSec, r.wallSec].some((n) => !Number.isFinite(n) || n < 0)) { await reject("invalid numbers"); continue; }
    if (r.plannedSec < 60 || r.plannedSec > 6 * 3600 || r.startedAt < now - 30 * DAY || r.startedAt > now + 5 * 60_000) { await reject("out of range"); continue; }

    // Credit = what the app measured, capped by the plan and by the wall-clock time that really passed.
    const credited = Math.floor(Math.min(r.runSec, r.plannedSec, r.wallSec + 5));
    const flagged = r.runSec > r.wallSec + 30; // measured more time than the clock says passed: the clock was moved back
    const reason = flagged ? "clock mismatch" : null;
    const subject = String(r.subject ?? "General").slice(0, 40) || "General";

    if (credited >= 10) {
      // If the session began online, a server run exists: merge into it so nothing is counted twice.
      const merged = r.runId ? await settleRunOffline(user.id, String(r.runId), credited, now) : false;
      if (!merged) {
        await run("INSERT INTO StudySession (id, userId, kind, subject, seconds, startedAt) VALUES (?,?,?,?,?,?)", newId(), user.id, "FOCUS", subject, credited, Math.floor(r.startedAt));
      }
    }
    await run(
      "INSERT INTO OfflineSync (clientId, userId, claimedSec, creditedSec, flagged, reason, startedAt, syncedAt) VALUES (?,?,?,?,?,?,?,?)",
      r.clientId, user.id, Math.floor(r.runSec), credited, flagged ? 1 : 0, reason, Math.floor(r.startedAt), now,
    );
    await logLock(user.id, flagged ? "OFFLINE_FLAGGED" : "OFFLINE_SYNCED");
    results.push({ clientId: r.clientId, ok: true, creditedSec: credited, flagged, reason: reason ?? undefined });
  }

  // Violations the app noticed while offline (left the lock, restarted...), with their real times.
  for (const e of (body.events ?? []).slice(0, 100)) {
    if (!e || !CLIENT_EVENT_KINDS.includes(e.kind) || !Number.isFinite(e.at)) continue;
    const at = Math.min(now, Math.max(now - 30 * DAY, Math.floor(e.at)));
    await run("INSERT INTO LockEvent (id, userId, kind, at) VALUES (?,?,?,?)", newId(), user.id, e.kind, at);
  }

  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
