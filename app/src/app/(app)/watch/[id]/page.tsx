import { ChannelLogo } from "@/components/ChannelLogo";
import Link from "next/link";
import { ChannelButton } from "@/components/ChannelButton";
import { FocusLayout } from "@/components/FocusLayout";
import { Notes } from "@/components/Notes";
import { SaveButton } from "@/components/SaveButton";
import { VideoCard } from "@/components/VideoCard";
import { all, get, run, type Channel } from "@/lib/db";
import { compactNum, timeAgo } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { playlistInfo, uploadsPage, videoDetail, type Playlist, type Video } from "@/lib/youtube";

export default async function Watch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ list?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { list } = await searchParams;

  const allowed = await all<Channel>("SELECT * FROM Channel WHERE userId = ? OR userId IS NULL", user.id);
  let info = null;
  let error = "";
  try {
    info = await videoDetail(id);
  } catch (e) {
    error = e instanceof Error ? e.message : "";
  }
  const channel = info ? allowed.find((ch) => ch.ytId === info.channelId) : undefined;

  if (!info || !channel) {
    return (
      <div className="card mx-auto mt-10 max-w-lg text-center">
        <h1 className="text-lg font-semibold">Video not available</h1>
        <p className="mt-1 text-sm text-muted">
          {error || (info ? `This video is from “${info.channelTitle}”, which is not in your study channels.` : "We could not find this video.")}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/videos" className="btn-ghost">Back to videos</Link>
          {info && <Link href={`/channel/${info.channelId}`} className="btn">View channel</Link>}
        </div>
      </div>
    );
  }

  // Remember what the student watched (powers "Continue watching" and History).
  await run(
    `INSERT INTO WatchHistory (userId, videoId, title, thumbnail, channelTitle, channelId, duration, watchedAt)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(userId, videoId) DO UPDATE SET watchedAt = excluded.watchedAt`,
    user.id, id, info.title, info.thumbnail, info.channelTitle, info.channelId, info.duration ?? null, Date.now(),
  );

  const saved = !!await get("SELECT 1 FROM SavedVideo WHERE userId = ? AND videoId = ?", user.id, id);
  const isGlobal = channel.userId === null;

  // Playlist mode: ?list=... shows the playlist (in order) instead of the channel's latest videos.
  let playlist: Playlist | null = null;
  let items: Video[] = [];
  if (list) {
    try {
      const pl = await playlistInfo(list);
      if (pl && allowed.some((ch) => ch.ytId === pl.channelId)) {
        playlist = pl;
        items = (await uploadsPage(list, 50)).videos;
      }
    } catch {}
  }
  const pos = items.findIndex((v) => v.id === id);
  const nextInList = pos >= 0 ? items[pos + 1] : undefined;

  let upNext: Video[] = [];
  if (!playlist) {
    try {
      upNext = (await uploadsPage(channel.uploadsId, 15)).videos.filter((v) => v.id !== id);
    } catch {}
  }

  return (
    <FocusLayout
      player={
        <>
          <div className="aspect-video overflow-hidden rounded-2xl bg-black shadow-lg">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`}
              title={info.title}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
          <h1 className="text-xl font-bold leading-snug sm:text-2xl">{info.title}</h1>
        </>
      }
      bar={
        <>
          <Link href={`/channel/${info.channelId}`} className="mr-1 flex items-center gap-2">
            <ChannelLogo src={channel.thumbnail} name={channel.title} size={40} priority />
            <span className="font-semibold hover:text-accent">{info.channelTitle}</span>
          </Link>
          {!isGlobal && <ChannelButton ytId={info.channelId} added />}
          <div className="ml-auto flex items-center gap-2">
            {nextInList && (
              <Link href={`/watch/${nextInList.id}?list=${list}`} className="btn !rounded-full">Next in playlist →</Link>
            )}
            <SaveButton saved={saved} video={{ id, title: info.title, thumbnail: info.thumbnail, channelTitle: info.channelTitle, channelId: info.channelId, duration: info.duration }} />
          </div>
        </>
      }
      below={
        <>
          <details className="rounded-2xl bg-soft p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              {info.views != null && `${compactNum(info.views)} views · `}
              {timeAgo(info.publishedAt)}
              {info.likes != null && ` · ${compactNum(info.likes)} likes`}
              <span className="text-muted"> — show description</span>
            </summary>
            <p className="mt-3 whitespace-pre-line break-words text-muted">{info.description || "No description."}</p>
          </details>
          <Notes videoId={id} />
        </>
      }
      side={
        playlist ? (
          <>
            <div>
              <Link href={`/playlist/${playlist.id}`} className="font-semibold hover:text-accent">{playlist.title}</Link>
              <p className="text-xs text-muted">{pos >= 0 ? `${pos + 1} / ` : ""}{playlist.itemCount} videos · {playlist.channelTitle}</p>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {items.map((v, i) => (
                <VideoCard key={`${v.id}-${i}`} v={v} horizontal list={list} active={v.id === id} index={i + 1} />
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="font-semibold">More from {info.channelTitle}</h2>
            {upNext.map((v) => (
              <VideoCard key={v.id} v={v} horizontal />
            ))}
            <Link href={`/channel/${info.channelId}`} className="btn-ghost w-full">See all videos & playlists</Link>
          </>
        )
      }
    />
  );
}
