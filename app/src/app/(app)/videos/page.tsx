import { ChannelLogo } from "@/components/ChannelLogo";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { VideoCard } from "@/components/VideoCard";
import { all, type Channel, type HistoryVideo } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { uploadsPage, type Video } from "@/lib/youtube";

export default async function Videos({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const user = await requireUser();
  const { s = "" } = await searchParams;
  const search = s.trim().toLowerCase();
  const channels = await all<Channel>(
    "SELECT * FROM Channel WHERE userId = ? OR userId IS NULL ORDER BY userId IS NULL DESC, title",
    user.id,
  );
  const recent = await all<HistoryVideo>("SELECT * FROM WatchHistory WHERE userId = ? ORDER BY watchedAt DESC LIMIT 4", user.id);

  // "Latest uploads" is only a quick preview; each channel page has the complete library.
  let videos: Video[] = [];
  let error = "";
  if (channels.length > 0) {
    if (!process.env.YOUTUBE_API_KEY) {
      error = "The site admin has not set YOUTUBE_API_KEY yet, so videos cannot be loaded.";
    } else {
      try {
        const lists = await Promise.all(channels.map(async (ch) => (await uploadsPage(ch.uploadsId, search ? 50 : 4)).videos));
        videos = lists.flat().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
        if (search) videos = videos.filter((v) => `${v.title} ${v.channelTitle}`.toLowerCase().includes(search));
      } catch (e) {
        error = e instanceof Error ? e.message : "Could not load videos";
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">My channels</h1>
          <p className="text-muted">Open a channel to see all its videos and playlists.</p>
        </div>
        <form className="relative w-full sm:max-w-xs">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input name="s" defaultValue={s} className="input !pl-10" placeholder="Search recent videos" aria-label="Search recent videos in my channels" />
        </form>
      </div>

      {!search && (
        <section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {channels.map((ch) => (
              <Link key={ch.id} href={`/channel/${ch.ytId}`} className="card group flex flex-col items-center !p-5 text-center transition hover:-translate-y-0.5 hover:border-accent">
                <ChannelLogo src={ch.thumbnail} name={ch.title} size={80} priority className="ring-4 ring-accent-soft" />
                <h2 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-accent">{ch.title}</h2>
                <span className="mt-1 text-xs text-muted">{ch.userId === null ? "Approved by admin ✓" : "Videos · Playlists"}</span>
              </Link>
            ))}
            <Link href="/discover" className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent/50 p-5 text-center text-accent transition hover:bg-accent-soft">
              <Icon name="plus" className="h-8 w-8" />
              <span className="text-sm font-semibold">Add channel</span>
            </Link>
          </div>
        </section>
      )}

      {channels.length === 0 && (
        <div className="card py-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Icon name="compass" className="h-7 w-7" /></span>
          <p className="mt-4 text-lg font-semibold">Pick your first study channel</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Search YouTube in the top bar (try “Khan Academy”) and press <b>Add to study</b>. Only channels you add will appear here.</p>
          <Link href="/discover?q=education" className="btn mt-5">Browse education channels</Link>
        </div>
      )}

      {recent.length > 0 && !search && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Continue watching</h2>
            <Link href="/history" className="text-sm text-accent hover:underline">See all</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((h) => (
              <VideoCard key={h.videoId} v={{ id: h.videoId, title: h.title, thumbnail: h.thumbnail, channelTitle: h.channelTitle, channelId: h.channelId, duration: h.duration }} />
            ))}
          </div>
        </section>
      )}

      {error && <p className="alert-error">{error}</p>}
      {search && videos.length === 0 && !error && <p className="text-muted">No recent videos match “{s}”. Open a channel to browse everything it has.</p>}

      {videos.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{search ? `Results for “${s}”` : "New uploads"}</h2>
          <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v) => (
              <VideoCard key={v.id} v={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
