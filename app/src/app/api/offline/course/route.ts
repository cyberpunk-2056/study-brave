import { all, newId, run } from "@/lib/db";
import { isDesktopRequest } from "@/lib/desktop";
import { getUser } from "@/lib/session";

// Records time spent on an admin-approved course website, opened inside the desktop app (see "course:open" in
// desktop/main.js). This is a convenience stat, kept in its own "COURSE" bucket — separate from the server-timed,
// anti-cheat-checked Pomodoro focus minutes, since nobody can verify what actually happened on someone else's site
// the way FocusRun verifies the student's own study block.
const MAX_SESSION_SEC = 6 * 3600; // generous ceiling against a clock glitch producing a huge number

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  if (!isDesktopRequest(req.headers)) return Response.json({ error: "Desktop app only" }, { status: 403 });

  let body: { domain?: string; title?: string; seconds?: number; startedAt?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const domain = String(body.domain ?? "").trim().toLowerCase();
  const title = String(body.title ?? domain).trim().slice(0, 60) || domain;
  const seconds = Math.max(0, Math.min(MAX_SESSION_SEC, Math.floor(Number(body.seconds) || 0)));
  const startedAt = Math.floor(Number(body.startedAt) || Date.now());
  if (!domain || seconds < 5) return Response.json({ ok: true }); // too short to be worth recording

  // Only ever credit a domain this student was actually approved to open (admin-only, per-student or global).
  const sites = await all<{ domain: string }>("SELECT domain FROM ExternalSite WHERE userId = ? OR userId IS NULL", user.id);
  const approved = sites.some((s) => domain === s.domain || domain.endsWith("." + s.domain));
  if (!approved) return Response.json({ error: "That site is not approved for this account." }, { status: 403 });

  await run(
    "INSERT INTO StudySession (id, userId, kind, subject, seconds, startedAt) VALUES (?,?,?,?,?,?)",
    newId(), user.id, "COURSE", title, seconds, startedAt,
  );
  return Response.json({ ok: true });
}
