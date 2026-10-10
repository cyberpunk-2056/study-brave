// Bridge exposed by the Focus Study Desktop app (desktop/preload.js). Undefined in a normal browser.
interface FocusShell {
  isDesktop: true;
  lock(): Promise<boolean>;
  /** Adds a line to the taskbar's notification list. */
  notify(title: string, body?: string): Promise<boolean>;
  unlock(): Promise<boolean>;
  status(): Promise<{ locked: boolean; version: string } | null>;
  onViolation(cb: (reason: string) => void): () => void;
  /** A locked session that could not reach the server at the end: let the app record it for later sync. */
  offlineComplete(s: { subject: string; startedAt: number; plannedSec: number; claimedSec: number; runId: string | null }): Promise<{ ok: boolean; error?: string }>;
}

interface Window {
  focusShell?: FocusShell;
}
