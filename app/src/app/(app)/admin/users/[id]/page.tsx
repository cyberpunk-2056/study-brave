import Link from "next/link";
import { notFound } from "next/navigation";
import { StatsView } from "@/components/StatsView";
import { GenerateCodeForm, ParentEmailForm, SendMessageForm } from "@/components/LockAdmin";
import { parentMessageUrl } from "@/lib/lock";
import { setStrictMode } from "@/app/actions/admin";
import { all, userById, type Channel, type LockEvent } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import type { SessionRow } from "@/lib/stats";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const user = await userById(id);
  if (!user) notFound();

  const sessions = await all<SessionRow>(
    "SELECT kind, subject, seconds, startedAt FROM StudySession WHERE userId = ? AND startedAt > ?",
    id,
    Date.now() - 100 * 86400_000,
  );
  const channels = await all<Channel>("SELECT * FROM Channel WHERE userId = ? ORDER BY title", id);
  const events = await all<LockEvent>("SELECT * FROM LockEvent WHERE userId = ? ORDER BY at DESC LIMIT 30", id);
  const counts = await all<{ kind: string; n: number }>("SELECT kind, COUNT(*) n FROM LockEvent WHERE userId = ? AND at > ? GROUP BY kind", id, Date.now() - 7 * 86400_000);
  const count = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  const LABEL: Record<string, string> = {
    FULLSCREEN_EXIT: "Left full-screen", TAB_SWITCH: "Switched tab", RELOAD: "Reloaded page",
    CODE_REQUESTED: "Asked for unlock code", CODE_FAILED: "Wrong unlock code", UNLOCKED_WITH_CODE: "Unlocked with code",
    HEARTBEAT_LOST: "Lost contact mid-session (app closed / offline)", APP_REQUIRED: "Tried to study outside the desktop app", APP_RESTARTED: "App restarted mid-session (shutdown / crash)", OFFLINE_SYNCED: "Offline session synced", OFFLINE_FLAGGED: "Offline session flagged (clock mismatch / invalid)",
  };
  const info: [string, string][] = [
    ["Email", user.email],
    ["Parent email", user.parentEmail ?? "— not set"],
    ["Phone", user.phone ?? "—"],
    ["Role", user.role],
    ["Status", user.disabled ? "Disabled" : "Active"],
    ["Joined", new Date(user.createdAt).toLocaleString()],
    ["Last login", user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"],
    ["Daily goal", `${user.dailyGoalMin} min`],
  ];

  return (
    <div className="space-y-4">
      <Link href="/admin/users" className="text-sm text-accent hover:underline">← All users</Link>
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-xl font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-xl font-bold">{user.name}</h2>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
              <dd className="mt-0.5 break-words font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {user.role === "STUDENT" && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">🔒 Study lock (strict full-screen mode)</h2>
              <p className="text-sm text-muted">Off: no lock. Lock: the timer locks the screen (full-screen in a browser, kiosk in the desktop app). Desktop app required: focus sessions can only start inside the Focus Study Desktop app. Early exit always needs a code sent to the parent and admin.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                [0, "Off"],
                [1, "Lock (browser or app)"],
                [2, "Desktop app required"],
              ] as const).map(([mode, label]) => (
                <form key={mode} action={setStrictMode}>
                  <input type="hidden" name="id" value={user.id} />
                  <input type="hidden" name="mode" value={mode} />
                  <button className={`chip ${user.strictMode === mode ? "chip-active" : ""}`} aria-pressed={user.strictMode === mode}>{label}</button>
                </form>
              ))}
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <ParentEmailForm id={user.id} current={user.parentEmail ?? ""} />
            <GenerateCodeForm id={user.id} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Last 7 days</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {["FULLSCREEN_EXIT", "TAB_SWITCH", "RELOAD", "HEARTBEAT_LOST", "APP_RESTARTED", "OFFLINE_SYNCED", "OFFLINE_FLAGGED", "APP_REQUIRED", "CODE_REQUESTED", "UNLOCKED_WITH_CODE"].map((k) => (
                <span key={k} className={`badge ${count(k) ? "bg-warn-bg text-warn-fg" : "bg-soft text-muted"}`}>{LABEL[k]}: {count(k)}</span>
              ))}
            </div>
            {events.length > 0 && (
              <ul className="mt-3 max-h-48 divide-y divide-line overflow-y-auto text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex justify-between py-1.5">
                    <span>{LABEL[e.kind] ?? e.kind}</span>
                    <span className="text-muted">{timeAgo(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {user.role === "STUDENT" && (
        <div className="card">
          <SendMessageForm id={user.id} parentLink={parentMessageUrl(user.id)} />
        </div>
      )}
      <div className="card">
        <h2 className="mb-2 font-semibold">Channels added by this student</h2>
        {channels.length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {channels.map((c) => (
              <li key={c.id} className="chip">{c.title}</li>
            ))}
          </ul>
        )}
      </div>
      <StatsView sessions={sessions} goalMin={user.dailyGoalMin} />
    </div>
  );
}
