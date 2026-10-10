import { deleteAnnouncement, postAnnouncement } from "@/app/actions/admin";
import { Icon } from "@/components/Icon";
import { all, type Announcement } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export default async function AdminAnnouncements() {
  await requireAdmin();
  const items = await all<Announcement>("SELECT * FROM Announcement ORDER BY createdAt DESC LIMIT 30");
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Announcements</h2>
        <p className="text-sm text-muted">Posted messages appear at the top of every student&apos;s home page for 14 days.</p>
      </div>
      <form action={postAnnouncement} className="space-y-2">
        <textarea name="message" required maxLength={500} rows={3} className="input" placeholder="e.g. Mock test on Saturday at 10 AM. Please revise Chapters 3–5." aria-label="Announcement message" />
        <button className="btn"><Icon name="megaphone" className="h-4 w-4" /> Post announcement</button>
      </form>
      <ul className="divide-y divide-line">
        {items.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div>
              <p className="whitespace-pre-line break-words">{a.message}</p>
              <p className="mt-1 text-xs text-muted">{timeAgo(a.createdAt)}</p>
            </div>
            <form action={deleteAnnouncement}>
              <input type="hidden" name="id" value={a.id} />
              <button className="btn-danger !px-2.5" aria-label="Delete announcement"><Icon name="trash" className="h-4 w-4" /></button>
            </form>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="text-sm text-muted">No announcements yet.</p>}
    </div>
  );
}
