import Link from "next/link";
import { deleteUser, setRole, toggleUser } from "@/app/actions/admin";
import { Icon } from "@/components/Icon";
import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fmtDuration } from "@/lib/stats";

type Row = {
  id: string; name: string; email: string; phone: string | null; role: string; disabled: number;
  createdAt: number; lastLoginAt: number | null; focusSec: number; sitSec: number; weekSec: number;
};

const fmtDate = (t: number | null) => (t ? new Date(t).toLocaleDateString() : "—");

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requireAdmin();
  const { q = "" } = await searchParams;
  const like = `%${q.trim()}%`;

  const users = await all<Row>(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.disabled, u.createdAt, u.lastLoginAt,
       COALESCE(SUM(CASE WHEN s.kind='FOCUS' THEN s.seconds END),0) AS focusSec,
       COALESCE(SUM(CASE WHEN s.kind='SITTING' THEN s.seconds END),0) AS sitSec,
       COALESCE(SUM(CASE WHEN s.kind='FOCUS' AND s.startedAt > ? THEN s.seconds END),0) AS weekSec
     FROM AppUser u LEFT JOIN StudySession s ON s.userId = u.id
     WHERE u.name ILIKE ? OR u.email ILIKE ? OR COALESCE(u.phone,'') ILIKE ?
     GROUP BY u.id ORDER BY u.createdAt DESC`,
    Date.now() - 7 * 86400_000, like, like, like,
  );

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">All users ({users.length})</h2>
        <div className="flex w-full gap-2 sm:w-auto">
          <form className="relative flex-1 sm:w-72">
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} className="input !pl-10" placeholder="Search name, email or phone" aria-label="Search users" />
          </form>
          <a href="/admin/export" className="btn-ghost whitespace-nowrap"><Icon name="download" className="h-4 w-4" /> CSV</a>
        </div>
      </div>

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              {["Student", "Phone", "Role", "Joined", "Last login", "Focus 7d", "Focus total", "Status", ""].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className="align-middle hover:bg-soft/60">
                <td className="px-2 py-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:text-accent">{u.name}</Link>
                  <div className="text-xs text-muted">{u.email}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-3">{u.phone ?? "—"}</td>
                <td className="px-2 py-3">
                  <span className={`badge ${u.role === "ADMIN" ? "bg-warn-bg text-warn-fg" : "bg-soft text-muted"}`}>{u.role === "ADMIN" ? "Admin" : "Student"}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-3">{fmtDate(u.createdAt)}</td>
                <td className="whitespace-nowrap px-2 py-3">{fmtDate(u.lastLoginAt)}</td>
                <td className="px-2 py-3">{fmtDuration(u.weekSec)}</td>
                <td className="px-2 py-3">{fmtDuration(u.focusSec)}</td>
                <td className="px-2 py-3">
                  <span className={`badge ${u.disabled ? "bg-bad-bg text-bad-fg" : "bg-ok-bg text-ok-fg"}`}>{u.disabled ? "Disabled" : "Active"}</span>
                </td>
                <td className="px-2 py-3">
                  {u.id !== admin.id && (
                    <div className="flex gap-1.5">
                      <form action={toggleUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn-ghost !px-2.5 !py-1 text-xs">{u.disabled ? "Enable" : "Disable"}</button>
                      </form>
                      <form action={setRole}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="role" value={u.role === "ADMIN" ? "STUDENT" : "ADMIN"} />
                        <button className="btn-ghost !px-2.5 !py-1 text-xs whitespace-nowrap">{u.role === "ADMIN" ? "Make student" : "Make admin"}</button>
                      </form>
                      <form action={deleteUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn-danger !px-2.5 !py-1" aria-label={`Delete ${u.name}`}><Icon name="trash" className="h-4 w-4" /></button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="py-8 text-center text-sm text-muted">No users found.</p>}
      </div>
    </div>
  );
}
