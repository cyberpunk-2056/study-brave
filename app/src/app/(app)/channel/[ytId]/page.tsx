import { ChannelLogo } from "@/components/ChannelLogo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChannelButton } from "@/components/ChannelButton";
import { PlaylistCard } from "@/components/PlaylistCard";
import { VideoCard } from "@/components/VideoCard";
import { get, type Channel } from "@/lib/db";
import { compactNum } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { channelById, channelPlaylists, uploadsPage, type Playlist, type Video } from "@/lib/youtube";

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ ytId: string }>;
  searchParams: Promise<{ tab?: string; t?: string }>;
}) {
  const user = await requireUser();
  const { ytId } = await params;
  const { tab: tabParam, t } = await searchParams;
  const tab = tabParam === "playlists" ? "playlists" : "videos";

  let info = null;
  let error = "";
  try {
    info = await channelById(ytId);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load channel";
  }
  if (!info && !error) notFound();

  const row = await get<Channel>("SELECT * FROM Channel WHERE ytId = ? AND (userId = ? OR userId IS NULL)", ytId, user.id);
  const added = !!row;
  const isGlobal = row?.userId === null;

  let videos: Video[] = [];
  let playlists: Playlist[] = [];
  let next: string | undefined;
  if (info && added) {
    try {
      if (tab === "videos") {
        const page = await uploadsPage(info.uploadsId, 48, t);
        videos = page.videos;
        next = page.next;
      } else {
        const page = await channelPlaylists(ytId, t);
        playlists = page.playlists;
        next = page.next;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load this channel";
    }
  }

  const tabLink = (id: string, label: string, count?: number) => (
    <Link
      href={`/channel/${ytId}?tab=${id}`}
      className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${tab === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"}`}
    >
      {label}
      {count != null && <span className="ml-1.5 text-xs font-normal text-muted">{compactNum(count)}</span>}
    </Link>
  );

  return (
    <div className="space-y-5">
      <Link href="/videos" className="text-sm text-accent hover:underline">← My channels</Link>
      {error && <p className="alert-error">{error}</p>}

      {info && (
        <div className="card overflow-hidden !p-0">
          <div
            className="h-28 bg-gradient-to-br from-accent to-accent-2 bg-cover bg-center sm:h-40"
            style={info.banner ? { backgroundImage: `url(/img?u=${encodeURIComponent(info.banner)})` } : undefined}
          />
          <div className="flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:items-end sm:text-left">
            <ChannelLogo src={info.thumbnail} name={info.title} size={112} priority className="-mt-14 border-4 border-surface sm:-mt-16" />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">{info.title}</h1>
              <p className="text-sm text-muted">
                {info.subscribers != null && `${compactNum(info.subscribers)} subscribers`}
                {info.videoCount != null && ` · ${compactNum(info.videoCount)} videos`}
                {isGlobal && " · approved by admin"}
              </p>
              <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm text-muted">{info.description}</p>
            </div>
            {isGlobal ? <span className="badge bg-ok-bg !px-4 !py-2 text-ok-fg">Approved ✓</span> : <ChannelButton ytId={ytId} added={added} />}
          </div>
          {added && (
            <nav className="flex border-t border-line px-2">
              {tabLink("videos", "Videos", info.videoCount)}
              {tabLink("playlists", "Playlists")}
            </nav>
          )}
        </div>
      )}

      {info && !added && (
        <div className="card py-8 text-center">
          <p className="font-semibold">Add this channel to your study list to watch its videos and playlists.</p>
          <p className="mt-1 text-sm text-muted">Only channels you add are visible, so recommendations never distract you.</p>
        </div>
      )}

      {tab === "videos" && (
        <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </div>
      )}
      {tab === "playlists" && (
        <>
          <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {playlists.map((p) => (
              <PlaylistCard key={p.id} p={p} />
            ))}
          </div>
          {added && playlists.length === 0 && !error && <p className="text-center text-muted">This channel has no public playlists.</p>}
        </>
      )}

      {(next || t) && (
        <div className="flex justify-center gap-2">
          {t && <Link href={`/channel/${ytId}?tab=${tab}`} className="btn-ghost">← First page</Link>}
          {next && <Link href={`/channel/${ytId}?tab=${tab}&t=${next}`} className="btn">Next {tab === "videos" ? "48 videos" : "playlists"} →</Link>}
        </div>
      )}
    </div>
  );
}
