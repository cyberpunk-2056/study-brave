"use client";

import { useState } from "react";

/** Opens an approved site inside the desktop app's locked view, or a new browser tab on the website. */
export function CourseSiteButton({ domain, title }: { domain: string; title: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (typeof window === "undefined" || !window.focusShell?.isDesktop) {
    return (
      <a href={`https://${domain.replace(/^\*\./, "")}`} target="_blank" rel="noopener noreferrer" className="btn whitespace-nowrap">
        Open ↗
      </a>
    );
  }

  return (
    <div>
      <button
        className="btn whitespace-nowrap"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const r = await window.focusShell!.openCourseSite(domain, title);
          setBusy(false);
          if (!r.ok) setError(r.error || "Could not open this site.");
        }}
      >
        {busy ? "Opening…" : "Open"}
      </button>
      {error && <p className="alert-error mt-1 max-w-[220px] !text-xs">{error}</p>}
    </div>
  );
}
