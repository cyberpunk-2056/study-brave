import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// Spreadsheet apps run text starting with = + - @ as formulas; prefix them so user-entered names can't.
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET() {
  await requireAdmin();
  const rows = await all<Record<string, unknown>>(
    `SELECT u.name, u.email, u.phone, u.parentEmail, u.role, u.disabled, u.createdAt, u.lastLoginAt,
       COALESCE(SUM(CASE WHEN s.kind='FOCUS' THEN s.seconds END),0) AS focusSec,
       COALESCE(SUM(CASE WHEN s.kind='SITTING' THEN s.seconds END),0) AS sitSec
     FROM AppUser u LEFT JOIN StudySession s ON s.userId = u.id GROUP BY u.id ORDER BY u.createdAt`,
  );
  const iso = (t: unknown) => (t ? new Date(Number(t)).toISOString() : "");
  const lines = [
    ["Name", "Email", "Phone", "Parent email", "Role", "Status", "Joined", "Last login", "Focus minutes", "Sitting minutes"].map(cell).join(","),
    ...rows.map((r) =>
      [r.name, r.email, r.phone, r.parentEmail, r.role, r.disabled ? "Disabled" : "Active", iso(r.createdAt), iso(r.lastLoginAt),
        Math.round(Number(r.focusSec) / 60), Math.round(Number(r.sitSec) / 60)].map(cell).join(","),
    ),
  ];
  return new Response(lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="focus-study-users.csv"' },
  });
}
