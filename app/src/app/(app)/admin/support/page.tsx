import Link from "next/link";
import { all } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

type Row = { id: string; name: string; lastBody: string; lastAt: number; lastFrom: string; unread: number };

export default async function AdminSupport() {
  await requireAdmin();
  const rows = await all<Row>(`
    SELECT u.id, u.name,
      m.body AS "lastBody", m.createdAt AS "lastAt", m.fromRole AS "lastFrom",
      (SELECT COUNT(*) FROM Message m2 WHERE m2.userId = u.id AND m2.fromRole = 'STUDENT' AND m2.read = 0) AS unread
    FROM AppUser u
    JOIN LATERAL (SELECT body, createdAt, fromRole FROM Message WHERE userId = u.id ORDER BY createdAt DESC LIMIT 1) m ON true
    WHERE u.role = 'STUDENT'
    ORDER BY unread DESC, m.createdAt DESC
  `);

  return (
    <div className="card">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">Support messages</h2>
        <p className="text-sm text-muted">Students can message you from their &quot;Contact support&quot; page. Reply here.</p>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/support/${r.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-soft">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.name}
                  {r.unread > 0 && <span className="badge ml-2 bg-bad-bg text-bad-fg">{r.unread} new</span>}
                </p>
                <p className="truncate text-xs text-muted">{r.lastFrom === "ADMIN" ? "You: " : ""}{r.lastBody}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{timeAgo(r.lastAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="text-sm text-muted">No support conversations yet.</p>}
    </div>
  );
}
