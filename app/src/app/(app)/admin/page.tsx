import Link from "next/link";
import { ActivityChart, type ActivityPoint } from "@/components/ActivityChart";
import { Icon, type IconName } from "@/components/Icon";
import { all, get } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { dayKey, fmtDuration } from "@/lib/stats";

export default async function AdminHome() {
  await requireAdmin();
  const weekAgo = Date.now() - 7 * 86400_000;
  const dayAgo = Date.now() - 86400_000;
  const one = async (sql: string, ...p: number[]) => (await get<{ n: number }>(sql, ...p))?.n ?? 0;

  const tiles: [IconName, string, string][] = [
    ["users", "Students", String(await one("SELECT COUNT(*) n FROM AppUser WHERE role = 'STUDENT'"))],
    ["flame", "Active (24h)", String(await one("SELECT COUNT(*) n FROM AppUser WHERE lastLoginAt > ?", dayAgo))],
    ["plus", "New this week", String(await one("SELECT COUNT(*) n FROM AppUser WHERE createdAt > ?", weekAgo))],
    ["timer", "Focus this week", fmtDuration(await one("SELECT COALESCE(SUM(seconds),0) n FROM StudySession WHERE kind='FOCUS' AND startedAt > ?", weekAgo))],
    ["chart", "Focus all time", fmtDuration(await one("SELECT COALESCE(SUM(seconds),0) n FROM StudySession WHERE kind='FOCUS'"))],
  ];

  // Last 14 days of activity across all students.
  const rows = await all<{ userId: string; seconds: number; startedAt: number }>(
    "SELECT userId, seconds, startedAt FROM StudySession WHERE kind='FOCUS' AND startedAt > ?",
    Date.now() - 15 * 86400_000,
  );
  const data: ActivityPoint[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = dayKey(d.getTime());
    const day = rows.filter((r) => dayKey(r.startedAt) === key);
    return {
      day: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      focusHours: Math.round((day.reduce((a, r) => a + r.seconds, 0) / 3600) * 10) / 10,
      activeStudents: new Set(day.map((r) => r.userId)).size,
    };
  });

  const newest = await all<{ id: string; name: string; email: string; createdAt: number }>(
    "SELECT id, name, email, createdAt FROM AppUser ORDER BY createdAt DESC LIMIT 5",
  );
  const top = await all<{ id: string; name: string; sec: number }>(
    `SELECT u.id, u.name, SUM(s.seconds) sec FROM StudySession s JOIN AppUser u ON u.id = s.userId
     WHERE s.kind='FOCUS' AND s.startedAt > ? GROUP BY u.id ORDER BY sec DESC LIMIT 5`,
    weekAgo,
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map(([icon, label, value]) => (
          <div key={label} className="card !p-4">
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} className="h-4 w-4" /></span>
              {label}
            </div>
            <div className="mt-2 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Activity — last 14 days</h2>
        <p className="mb-3 text-xs text-muted">Total focus hours and number of active students per day.</p>
        <ActivityChart data={data} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Newest students</h2>
            <Link href="/admin/users" className="text-sm text-accent hover:underline">All users</Link>
          </div>
          <ul className="divide-y divide-line">
            {newest.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/admin/users/${u.id}`} className="min-w-0 hover:text-accent">
                  <div className="truncate font-medium">{u.name}</div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                </Link>
                <span className="shrink-0 text-xs text-muted">{timeAgo(u.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Top focus this week 🏆</h2>
          {top.length === 0 ? (
            <p className="text-sm text-muted">No study sessions yet this week.</p>
          ) : (
            <ol className="divide-y divide-line">
              {top.map((u, i) => (
                <li key={u.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
                  <Link href={`/admin/users/${u.id}`} className="flex-1 truncate font-medium hover:text-accent">{u.name}</Link>
                  <span className="text-muted">{fmtDuration(u.sec)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
