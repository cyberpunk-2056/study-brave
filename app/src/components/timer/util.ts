// Small helpers shared by the timer components.

export const mmss = (s: number) => {
  s = Math.max(0, Math.round(s));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  return `${h ? h + "h " : ""}${Math.floor((s % 3600) / 60)}m`;
};

export function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.connect(ctx.destination);
    o.frequency.value = 880;
    o.start();
    setTimeout(() => (o.stop(), ctx.close()), 400);
  } catch {
    /* sound is optional */
  }
}

// ---------- Full-screen helpers ----------
type KeyboardApi = { lock?: (keys: string[]) => Promise<void>; unlock?: () => void };
const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard;
export const shell = () => (typeof window !== "undefined" ? window.focusShell : undefined);
export const fullscreenSupported = () => !!shell() || (typeof document !== "undefined" && !!document.documentElement.requestFullscreen);

/** Must be called straight from a click. In the desktop app this engages the real kiosk lock;
 *  in a normal browser it uses full-screen and captures Esc/F11 where allowed (Chrome, Edge). */
export async function enterFullscreen() {
  const app = shell();
  if (app) {
    try {
      return await app.lock();
    } catch {
      return false;
    }
  }
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch {
    /* refused */
  }
  try {
    await keyboard()?.lock?.(["Escape", "F11"]);
  } catch {
    /* not supported */
  }
  return !!document.fullscreenElement;
}

export function leaveFullscreen() {
  const app = shell();
  if (app) {
    void app.unlock().catch(() => {});
    return;
  }
  try {
    keyboard()?.unlock?.();
  } catch {
    /* ignore */
  }
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
  } catch {
    /* ignore */
  }
}
