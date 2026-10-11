"use client";

import { useState } from "react";
import { Icon } from "./Icon";

/** Gmail, desktop-icon style — opens in its own in-app view in the desktop app (same mechanics as a course site,
 *  but built in for every student, no admin approval needed), or a new browser tab outside the desktop app. */
export function GmailIcon() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isDesktop = typeof window !== "undefined" && !!window.focusShell?.isDesktop;

  const open = async () => {
    if (!isDesktop) {
      window.open("https://mail.google.com/mail/", "_blank", "noopener,noreferrer");
      return;
    }
    setBusy(true);
    setError("");
    const r = await window.focusShell!.openGmail();
    setBusy(false);
    if (!r.ok) setError(r.error || "Could not open Gmail.");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="group flex w-20 flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-white/10 focus-visible:bg-white/10 disabled:opacity-60 sm:w-24"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft text-fg shadow-sm transition group-hover:scale-105 sm:h-14 sm:w-14">
          <Icon name="mail" className="h-6 w-6" />
        </span>
        <span className="line-clamp-2 text-xs font-medium text-fg drop-shadow sm:text-sm">Gmail</span>
      </button>
      {error && <p className="alert-error absolute left-1/2 top-full z-10 mt-1 w-40 -translate-x-1/2 !text-xs">{error}</p>}
    </div>
  );
}
