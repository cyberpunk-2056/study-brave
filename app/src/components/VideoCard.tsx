import Link from "next/link";
import { compactNum, timeAgo } from "@/lib/format";

export type CardVideo = {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  publishedAt?: string | number;
  duration?: string | null;
  views?: number;
};

export function VideoCard({ v, horizontal = false, meta, list, active = false, index }: { v: CardVideo; horizontal?: boolean; meta?: string; list?: string; active?: boolean; index?: number }) {
  const href = `/watch/${v.id}${list ? `?list=${list}` : ""}`;
  const sub = [v.views != null ? `${compactNum(v.views)} views` : null, v.publishedAt ? timeAgo(v.publishedAt) : null, meta]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`group ${horizontal ? "flex gap-3" : ""} ${active ? "rounded-xl bg-accent-soft p-1.5" : ""}`}>
      {index != null && <span className="w-5 shrink-0 self-center text-center text-xs text-muted">{active ? "▶" : index}</span>}
      <Link
        href={href}
        className={`relative block overflow-hidden rounded-xl bg-soft ${horizontal ? "w-36 shrink-0 sm:w-40" : ""}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" />
        {v.duration && <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">{v.duration}</span>}
      </Link>
      <div className={horizontal ? "min-w-0 flex-1" : "mt-2.5"}>
        <Link href={href} className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-accent">
          {v.title}
        </Link>
        <Link href={`/channel/${v.channelId}`} className="mt-1 block truncate text-xs text-muted hover:text-fg">
          {v.channelTitle}
        </Link>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
    </div>
  );
}
