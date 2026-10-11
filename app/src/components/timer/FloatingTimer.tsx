"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { TimerCard } from "./TimerCard";
import { useTimer } from "./TimerProvider";
import { mmss } from "./util";

/**
 * A small pill, bottom-right on every screen size, that opens the full Pomodoro timer. Navigation now lives
 * behind the menu button instead of an always-open sidebar, so this is the timer's only home.
 */
export function FloatingTimer() {
  const { ready, remaining, st, lockedRunning } = useTimer();
  const [open, setOpen] = useState(false);

  // Close with Escape; keep the page from scrolling behind the open panel on phones.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!ready) return null;

  return (
    <div>
      {open && <button className="fixed inset-0 z-40 cursor-default bg-black/30" aria-label="Close timer" onClick={() => setOpen(false)} tabIndex={-1} />}
      {open ? (
        <aside className="fixed bottom-20 left-3 right-3 z-50 max-h-[72vh] overflow-y-auto rounded-3xl border border-line bg-surface p-4 shadow-2xl sm:left-auto sm:w-80 lg:bottom-4" role="dialog" aria-label="Study timer">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Study timer</h2>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-soft hover:text-fg" aria-label="Minimize timer">
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>
          <TimerCard variant="floating" />
        </aside>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-3 z-50 flex items-center gap-2 rounded-full bg-gradient-to-br from-accent to-accent-2 py-2.5 pl-3.5 pr-4 text-sm font-semibold tabular-nums text-white shadow-lg transition active:scale-95 lg:bottom-4"
          aria-label="Open study timer"
        >
          <Icon name="timer" className="h-5 w-5" />
          {mmss(remaining)}
          {lockedRunning ? <span aria-hidden>🔒</span> : st.running && <span className="h-2 w-2 animate-pulse rounded-full bg-white" />}
        </button>
      )}
    </div>
  );
}
