import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";
import { VideoCard } from "@/components/VideoCard";
import { all, type SavedVideo } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function Saved() {
  const user = await requireUser();
  const videos = await all<SavedVideo>("SELECT * FROM SavedVideo WHERE userId = ? ORDER BY savedAt DESC", user.id);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Saved videos</h1>
        <p className="text-muted">Your watch-later list.</p>
      </div>
      {videos.length === 0 && (
        <div className="card py-10 text-center">
          <p className="font-semibold">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted">Open a video and press <b>Save</b> to keep it here.</p>
          <Link href="/videos" className="btn mt-4">Browse videos</Link>
        </div>
      )}
      <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((v) => (
          <div key={v.videoId}>
            <VideoCard v={{ id: v.videoId, title: v.title, thumbnail: v.thumbnail, channelTitle: v.channelTitle, channelId: v.channelId, duration: v.duration }} meta={`saved ${new Date(v.savedAt).toLocaleDateString()}`} />
            <div className="mt-2">
              <SaveButton saved video={{ id: v.videoId, title: v.title, thumbnail: v.thumbnail, channelTitle: v.channelTitle, channelId: v.channelId }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
