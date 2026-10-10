import Link from "next/link";
import type { Playlist } from "@/lib/youtube";

export function PlaylistCard({ p }: { p: Playlist }) {
  return (
    <Link href={`/playlist/${p.id}`} className="group block">
      <div className="relative">
        {/* stacked-cards effect to look like a playlist */}
        <div className="absolute inset-x-3 -top-1.5 h-2 rounded-t-lg bg-line" />
        <div className="relative overflow-hidden rounded-xl bg-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.thumbnail ? <img src={p.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="aspect-video" />}
          <span className="absolute inset-y-0 right-0 flex w-1/3 flex-col items-center justify-center bg-black/70 text-white">
            <span className="text-lg font-bold">{p.itemCount}</span>
            <span className="text-[11px]">videos</span>
          </span>
        </div>
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-accent">{p.title}</h3>
      <p className="text-xs text-muted">View full playlist</p>
    </Link>
  );
}
