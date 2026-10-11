"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

const KEY = "fs_quicknotes";

/** A scratchpad for jotting formulas, reminders or half-finished thoughts while studying — saved only on this
 *  device (not synced, not sent anywhere), so it's there the moment it's opened with no loading, ever. */
export function QuickNotes() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      setText(localStorage.getItem(KEY) ?? "");
    } catch {
      /* private browsing etc: just start blank */
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const onChange = (v: string) => {
    setText(v);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, v);
      } catch {
        /* storage unavailable: nothing to do, the note just won't survive a reload */
      }
      setSaved(true);
    }, 400);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-20 flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-white/10 focus-visible:bg-white/10 sm:w-24"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft text-fg shadow-sm transition group-hover:scale-105 sm:h-14 sm:w-14">
          <Icon name="notes" className="h-6 w-6" />
        </span>
        <span className="line-clamp-2 text-xs font-medium text-fg drop-shadow sm:text-sm">Quick Notes</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Quick Notes">
            <button className="backdrop-enter absolute inset-0 bg-bg/60 backdrop-blur-sm" aria-label="Close" onClick={() => setOpen(false)} />
            <div className="drawer-enter absolute left-1/2 top-1/2 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-surface p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Quick Notes</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">{saved ? "Saved" : "Saving…"}</span>
                  <button className="btn-ghost !px-2.5" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" className="h-4 w-4" /></button>
                </div>
              </div>
              <textarea
                value={text}
                onChange={(e) => onChange(e.target.value)}
                rows={10}
                className="input w-full resize-none"
                placeholder="Jot a formula, a reminder, anything…"
                aria-label="Quick notes"
                autoFocus
              />
              <p className="mt-2 text-xs text-muted">Saved only on this device — not synced anywhere.</p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
