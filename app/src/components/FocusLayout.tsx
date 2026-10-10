"use client";

import { useState } from "react";
import { Icon } from "./Icon";

/** Watch-page layout with a "Focus mode" that hides the suggestion list so only the video and notes remain. */
export function FocusLayout({
  player,
  bar,
  below,
  side,
}: {
  player: React.ReactNode;
  bar: React.ReactNode;
  below: React.ReactNode;
  side: React.ReactNode;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div className={`grid gap-6 ${focus ? "" : "lg:grid-cols-[minmax(0,1fr)_360px]"}`}>
      <div className={`min-w-0 space-y-4 ${focus ? "mx-auto w-full max-w-5xl" : ""}`}>
        {player}
        <div className="flex flex-wrap items-center gap-2">
          {bar}
          <button
            onClick={() => setFocus((f) => !f)}
            className={`btn-ghost !rounded-full ${focus ? "!border-accent !bg-accent-soft !text-accent" : ""}`}
            aria-pressed={focus}
            title="Hide suggestions and distractions"
          >
            <Icon name="focus" className="h-4 w-4" /> {focus ? "Exit focus mode" : "Focus mode"}
          </button>
        </div>
        {below}
      </div>
      {!focus && <aside className="min-w-0 space-y-3">{side}</aside>}
    </div>
  );
}
