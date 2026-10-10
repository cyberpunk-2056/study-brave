"use client";

import { useEffect, useState } from "react";

// Notes are kept in this browser only (per video).
export function Notes({ videoId }: { videoId: string }) {
  const key = `fs_notes_${videoId}`;
  const [text, setText] = useState("");
  useEffect(() => {
    try {
      setText(localStorage.getItem(key) ?? "");
    } catch {}
  }, [key]);
  return (
    <div className="card">
      <h2 className="mb-2 font-semibold">My notes</h2>
      <textarea
        className="input min-h-40"
        placeholder="Write key points, formulas, questions…"
        value={text}
        aria-label="Notes for this video"
        onChange={(e) => {
          setText(e.target.value);
          try {
            localStorage.setItem(key, e.target.value);
          } catch {}
        }}
      />
      <p className="mt-1.5 text-xs text-muted">Saved automatically on this device.</p>
    </div>
  );
}
