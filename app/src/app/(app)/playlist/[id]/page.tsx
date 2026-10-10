import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoCard } from "@/components/VideoCard";
import { get, type Channel } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { playlistInfo, uploadsPage } from "@/lib/youtube";

export default async function PlaylistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { t } = await searchParams;

  let info = null;
  let error = "";
  try {
    info = await playlistInfo(id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load playlist";
  }
  if (!info && !error) notFound();

  const allowed = info
    ? await get<Channel>("SELECT * FROM Channel WHERE ytId = ? AND (userId = ? OR userId IS NULL)", info.channelId, user.id)
    : undefined;

  if (info && !allowed) {
    return (
      <div className="card mx-auto mt-10 max-w-lg text-center">
        <h1 className="text-lg font-semibold">Playlist not available</h1>
        <p className="mt-1 text-sm text-muted">It belongs to “{info.channelTitle}”, which is not in your study channels.</p>
        <Link href={`/channel/${info.channelId}`} className="btn mt-5">View channel</Link>
      </div>
    );
  }

  let page: Awaited<ReturnType<typeof uploadsPage>> = { videos: [] };
  if (info) {
    try {
      page = await uploadsPage(id, 50, t);
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load videos";
    }
  }
  const first = page.videos[0];

  return (
    <div className="space-y-5">
      {info && <Link href={`/channel/${info.channelId}?tab=playlists`} className="text-sm text-accent hover:underline">← {info.channelTitle} playlists</Link>}
      {error && <p className="alert-error">{error}</p>}
      {info && (
        <div className="card flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{info.title}</h1>
            <p className="text-sm text-muted">
              <Link href={`/channel/${info.channelId}`} className="hover:text-accent">{info.channelTitle}</Link> · {info.itemCount} videos
            </p>
          </div>
          {first && !t && <Link href={`/watch/${first.id}?list=${id}`} className="btn">▶ Play all</Link>}
        </div>
      )}

      <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {page.videos.map((v, i) => (
          <VideoCard key={`${v.id}-${i}`} v={v} list={id} />
        ))}
      </div>

      {(page.next || t) && (
        <div className="flex justify-center gap-2">
          {t && <Link href={`/playlist/${id}`} className="btn-ghost">← First page</Link>}
          {page.next && <Link href={`/playlist/${id}?t=${page.next}`} className="btn">Next page →</Link>}
        </div>
      )}
    </div>
  );
}
