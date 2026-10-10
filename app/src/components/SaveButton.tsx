import { toggleSave } from "@/app/actions/study";
import { Icon } from "./Icon";

export function SaveButton({
  saved,
  video,
}: {
  saved: boolean;
  video: { id: string; title: string; thumbnail: string; channelTitle: string; channelId: string; duration?: string };
}) {
  return (
    <form action={toggleSave}>
      <input type="hidden" name="videoId" value={video.id} />
      <input type="hidden" name="title" value={video.title} />
      <input type="hidden" name="thumbnail" value={video.thumbnail} />
      <input type="hidden" name="channelTitle" value={video.channelTitle} />
      <input type="hidden" name="channelId" value={video.channelId} />
      <input type="hidden" name="duration" value={video.duration ?? ""} />
      <button className={`btn-ghost !rounded-full ${saved ? "!border-accent !bg-accent-soft !text-accent" : ""}`}>
        <Icon name="bookmark" className="h-4 w-4" />
        {saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}
