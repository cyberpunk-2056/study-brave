import { ChannelLogo } from "@/components/ChannelLogo";
import Link from "next/link";
import { removeGlobalChannel } from "@/app/actions/admin";
import { Icon } from "@/components/Icon";
import { all, type Channel } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export default async function AdminChannels() {
  await requireAdmin();
  const channels = await all<Channel>("SELECT * FROM Channel WHERE userId IS NULL ORDER BY title");
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Channels approved for all students</h2>
        <p className="text-sm text-muted">Every student always sees these, in addition to the channels they add themselves.</p>
      </div>
      <form action="/discover" className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="scope" value="global" />
        <input name="q" required className="input" placeholder="Search YouTube for a channel to approve (e.g. Khan Academy)" aria-label="Search channels" />
        <button className="btn whitespace-nowrap"><Icon name="search" className="h-4 w-4" /> Search YouTube</button>
      </form>
      <ul className="divide-y divide-line">
        {channels.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <Link href={`/channel/${c.ytId}`} className="flex min-w-0 items-center gap-3 hover:text-accent">
              <ChannelLogo src={c.thumbnail} name={c.title} size={40} />
              <span className="truncate font-medium">{c.title}</span>
            </Link>
            <form action={removeGlobalChannel}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-danger">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      {channels.length === 0 && <p className="text-sm text-muted">No global channels yet. Search above and press “Approve for all”.</p>}
    </div>
  );
}
