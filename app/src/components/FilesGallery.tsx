"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type FileRow = { name: string; size: number; mtimeMs: number };

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

/** "My Files": screenshots shown right inside the app — real local files, not a page about them, and not a
 *  Windows Explorer window the student has to leave the app to see. */
export function FilesGallery() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // name currently being deleted, or "refresh"

  const load = async () => {
    if (!window.focusShell?.isDesktop) return;
    setBusy("refresh");
    setError("");
    const r = await window.focusShell.listFiles();
    setBusy(null);
    if (!r.ok) return setError(r.error || "Could not read the folder.");
    setFiles(r.files ?? []);
  };

  useEffect(() => {
    const desktop = typeof window !== "undefined" && !!window.focusShell?.isDesktop;
    setIsDesktop(desktop);
    if (desktop) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (name: string) => {
    setBusy(name);
    const r = await window.focusShell!.deleteFile(name);
    setBusy(null);
    if (!r.ok) return setError(r.error || "Could not delete the file.");
    setFiles((fs) => fs.filter((f) => f.name !== name));
  };

  if (isDesktop === null) return null;

  if (!isDesktop) {
    return (
      <div className="card text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-soft text-accent"><Icon name="folder" className="h-7 w-7" /></span>
        <p className="font-medium">Only available in the Focus Study Desktop app</p>
        <p className="mt-1 text-sm text-muted">This shows the screenshots saved on that device. There&apos;s nothing to show in an ordinary browser.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{files.length} screenshot{files.length === 1 ? "" : "s"}</p>
        <button className="btn-ghost" onClick={load} disabled={busy === "refresh"}>
          <Icon name="history" className="h-4 w-4" /> {busy === "refresh" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="alert-error" role="alert">{error}</p>}

      {files.length === 0 ? (
        <p className="card text-center text-sm text-muted">
          No screenshots yet — take one from the camera button in the taskbar.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <div key={f.name} className="card !p-2">
              <div className="overflow-hidden rounded-xl bg-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`focusfile://local/${encodeURIComponent(f.name)}`} alt={f.name} className="aspect-video w-full object-cover" loading="lazy" />
              </div>
              <div className="mt-2 flex items-start justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted">{new Date(f.mtimeMs).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                  <p className="text-xs text-muted">{fmtBytes(f.size)}</p>
                </div>
                <button className="btn-danger !p-2" aria-label={`Delete ${f.name}`} title="Delete" disabled={busy === f.name} onClick={() => remove(f.name)}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
