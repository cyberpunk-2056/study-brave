// Bridge exposed by the Focus Study Desktop app (desktop/preload.js). Undefined in a normal browser.
type TimerUpdate = {
  source: "web";
  phase: "FOCUS" | "BREAK";
  running: boolean;
  locked: boolean;
  remainingSec: number;
  totalSec: number;
  subject: string;
  round: number;
  started: boolean;
};

interface FocusShell {
  isDesktop: true;
  lock(): Promise<boolean>;
  /** Shows the website's timer in the desktop taskbar. */
  timerUpdate(t: TimerUpdate): Promise<boolean>;
  /** Start/Pause clicks from the taskbar. */
  onTimerCommand(cb: (cmd: "toggle") => void): () => void;
  /** Adds a line to the taskbar's notification list. */
  notify(title: string, body?: string): Promise<boolean>;
  unlock(): Promise<boolean>;
  status(): Promise<{ locked: boolean; version: string } | null>;
  onViolation(cb: (reason: string) => void): () => void;
  /** A locked session that could not reach the server at the end: let the app record it for later sync. */
  offlineComplete(s: { subject: string; startedAt: number; plannedSec: number; claimedSec: number; runId: string | null }): Promise<{ ok: boolean; error?: string }>;
  /** Navigates the app to an admin-approved course site (locked to that domain) or back to Focus Study. */
  openCourseSite(domain: string, title: string): Promise<{ ok: boolean; error?: string }>;
  /** Opens Gmail in its own in-app view, taskbar chip and all — same mechanics as a course site, but a built-in
   *  utility every student gets, not something an admin has to approve. */
  openGmail(): Promise<{ ok: boolean; error?: string }>;
  /** Lists screenshots for the in-app "My Files" gallery. Each name can be shown with
   *  `focusfile://local/<name>` as an <img> src — real files, rendered inside the app itself. */
  listFiles(): Promise<{ ok: boolean; files?: { name: string; size: number; mtimeMs: number }[]; error?: string }>;
  deleteFile(name: string): Promise<{ ok: boolean; error?: string }>;
}

interface Window {
  focusShell?: FocusShell;
}
