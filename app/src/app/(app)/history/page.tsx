import { clearHistory } from "@/app/actions/study";
import { VideoCard } from "@/components/VideoCard";
import { all, type HistoryVideo } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function History() {
  const user = await requireUser();
  const videos = await all<HistoryVideo>("SELECT * FROM WatchHistory WHERE userId = ? ORDER BY watchedAt DESC LIMIT 60", user.id);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Watch history</h1>
          <p className="text-muted">Pick up where you left off.</p>
        </div>
        {videos.length > 0 && (
          <form action={clearHistory}>
            <button className="btn-danger">Clear history</button>
          </form>
        )}
      </div>
      {videos.length === 0 && <div className="card py-10 text-center text-muted">Videos you watch will show up here.</div>}
      <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((v) => (
          <VideoCard key={v.videoId} v={{ id: v.videoId, title: v.title, thumbnail: v.thumbnail, channelTitle: v.channelTitle, channelId: v.channelId, duration: v.duration }} meta={`watched ${timeAgo(v.watchedAt)}`} />
        ))}
      </div>
    </div>
  );
}
