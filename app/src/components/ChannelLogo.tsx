"use client";

import { useState } from "react";

/** Rewrites YouTube's size parameter (…=s240-c-k…) so small avatars download small files. */
function sized(url: string, px: number) {
  const want = Math.min(800, Math.max(48, Math.round(px * 2))); // 2x for sharp screens
  return /=s\d+/.test(url) ? url.replace(/=s\d+/, `=s${want}`) : url;
}

/**
 * Channel logo that loads through our caching proxy (/img), shows a coloured placeholder while loading,
 * and falls back to the channel's initial if the image can't be fetched.
 */
export function ChannelLogo({ src, name, size = 48, className = "", priority = false }: { src?: string | null; name: string; size?: number; className?: string; priority?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const url = src ? `/img?u=${encodeURIComponent(sized(src, size))}` : null;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-accent-2 font-semibold text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
      {url && state !== "error" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={`absolute inset-0 h-full w-full bg-surface object-cover transition-opacity duration-300 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
