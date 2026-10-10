"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportLockEvent, requestUnlockCode, verifyUnlockCode, type LockResult } from "@/app/actions/lock";
import { beatFocusRun, finishFocusRun, startFocusRun } from "@/app/actions/focus";
import { logSession } from "@/app/actions/study";
import { Icon } from "./Icon";

type Phase = "FOCUS" | "BREAK";
type State = {
  phase: Phase;
  running: boolean;
  segStart: number | null; // when the current running segment began
  elapsed: number; // seconds accumulated in earlier segments of this phase
  startedAt: number | null; // first start of this phase (saved with the log)
  subject: string;
  focusMin: number;
  breakMin: number;
  cycles: number;
  sitStart: number | null;
  locked: boolean; // strict full-screen lock is active for this focus block
  runId: string | null; // server-side focus run that measures the study time (anti-cheat)
};

const KEY = "fs_timer_v1";
const SIT_REMINDER_SEC = 45 * 60;
const PRESETS: [number, number][] = [[25, 5], [50, 10], [90, 15]];
const initial: State = {
  phase: "FOCUS", running: false, segStart: null, elapsed: 0, startedAt: null,
  subject: "", focusMin: 25, breakMin: 5, cycles: 0, sitStart: null, locked: false, runId: null,
};

const mmss = (s: number) => {
  s = Math.max(0, Math.round(s));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  return `${h ? h + "h " : ""}${Math.floor((s % 3600) / 60)}m`;
};

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.connect(ctx.destination);
    o.frequency.value = 880;
    o.start();
    setTimeout(() => (o.stop(), ctx.close()), 400);
  } catch {}
}

// ---------- Full-screen helpers ----------
type KeyboardApi = { lock?: (keys: string[]) => Promise<void>; unlock?: () => void };
const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard;
const shell = () => (typeof window !== "undefined" ? window.focusShell : undefined);
const fullscreenSupported = () => !!shell() || (typeof document !== "undefined" && !!document.documentElement.requestFullscreen);

/** Must be called straight from a click. In the desktop app this engages the real kiosk lock;
 *  in a normal browser it uses full-screen and captures Esc/F11 where allowed (Chrome, Edge). */
async function enterFullscreen() {
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
  } catch {}
  try {
    await keyboard()?.lock?.(["Escape", "F11"]);
  } catch {}
  return !!document.fullscreenElement;
}
function leaveFullscreen() {
  const app = shell();
  if (app) {
    void app.unlock().catch(() => {});
    return;
  }
  try { keyboard()?.unlock?.(); } catch {}
  try { if (document.fullscreenElement) void document.exitFullscreen(); } catch {}
}

const R = 52;
const C = 2 * Math.PI * R;

/** Ask for a code (emailed to parent + admin) and enter it to stop early. */
function UnlockPanel({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<LockResult>();
  const [busy, setBusy] = useState(false);

  const request = async () => {
    setBusy(true);
    setMsg(await requestUnlockCode());
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true);
    const r = await verifyUnlockCode(code);
    setBusy(false);
    if (r.unlocked) onUnlocked();
    else setMsg(r);
  };

  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">
        To stop early you need a 6-digit code. It is emailed to your parent and your admin — not to you.
      </p>
      <button className="btn-ghost w-full" onClick={request} disabled={busy}>Email me a code request</button>
      <div className="flex gap-2">
        <input
          className="input tracking-[0.3em]"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-label="Unlock code"
        />
        <button className="btn" onClick={verify} disabled={busy || code.length !== 6}>Unlock</button>
      </div>
      {msg?.error && <p className="alert-error" role="alert">{msg.error}</p>}
      {msg?.ok && <p className="alert-ok" role="status">{msg.ok}</p>}
    </div>
  );
}

export function Timer({ level = 0 }: { level?: number }) {
  const strict = level >= 1;
  const [st, setSt] = useState<State>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [sitAlert, setSitAlert] = useState(false);
  const [resumedNotice, setResumedNotice] = useState(false);
  const stRef = useRef(st);
  stRef.current = st;
  const releasing = useRef(false); // true while WE are leaving full-screen on purpose
  const [desktop, setDesktop] = useState(false); // running inside Focus Study Desktop
  const needApp = level === 2 && !desktop;

  // Restore after refresh / navigation. Start expanded only on large screens.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      let s: State = raw ? { ...initial, ...JSON.parse(raw) } : initial;
      // A reload drops full-screen. If a locked block was running, pause it (only time seen so far counts).
      const wasRunning = s.locked && s.running;
      if (wasRunning) {
        const seen = Number(localStorage.getItem(KEY + "_seen")) || s.segStart || Date.now();
        s = { ...s, running: false, elapsed: s.elapsed + Math.max(0, (seen - (s.segStart ?? seen)) / 1000), segStart: null };
        // In the desktop app this means the PC was shut down / restarted (or the app crashed); in a browser, a reload.
        void reportLockEvent(window.focusShell ? "APP_RESTARTED" : "RELOAD");
      }
      if (!strict && s.locked) s = { ...s, locked: false }; // admin turned strict mode off
      setSt(s);
      setDesktop(!!window.focusShell);
      if (s.locked && window.focusShell) void window.focusShell.lock(); // app restarted mid-lock: lock again at once
      // The server's count is the truth: take over its credited time, then (desktop app only) carry on automatically.
      void (async () => {
        let elapsed = s.elapsed;
        if (s.runId && s.phase === "FOCUS") {
          try {
            const r = await beatFocusRun(s.runId, false);
            if ("gone" in r && r.gone) setSt((c) => ({ ...c, runId: null }));
            else if ("creditedSec" in r && typeof r.creditedSec === "number") elapsed = r.creditedSec;
          } catch {
            /* offline: keep the locally saved value */
          }
        }
        if (window.focusShell && wasRunning && s.locked && strict) {
          setSt((c) => ({ ...c, elapsed, running: true, segStart: Date.now() }));
          setResumedNotice(true);
          setTimeout(() => setResumedNotice(false), 9000);
        } else setSt((c) => ({ ...c, elapsed }));
      })();
      const o = localStorage.getItem(KEY + "_open");
      setOpen(o ? o === "1" : window.innerWidth >= 1024);
    } catch {}
    setReady(true);
  }, [strict]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
      localStorage.setItem(KEY + "_open", open ? "1" : "0");
    } catch {}
  }, [st, open, ready]);

  const totalSec = (s: State) => (s.phase === "FOCUS" ? s.focusMin : s.breakMin) * 60;
  const usedSec = (s: State, t: number) => s.elapsed + (s.running && s.segStart ? (t - s.segStart) / 1000 : 0);

  const saveBlock = useCallback((s: State, t: number) => {
    if (s.phase === "FOCUS") {
      // The server already measured this run; stopping just closes it (a locked run needs a recent unlock code).
      if (s.runId) void finishFocusRun(s.runId, "STOP", s.running).catch(() => {});
      return;
    }
    const secs = usedSec(s, t);
    if (s.startedAt && secs >= 10) void logSession("BREAK", s.subject, secs, s.startedAt);
  }, []);

  const release = useCallback(() => {
    releasing.current = true;
    leaveFullscreen();
    setTimeout(() => (releasing.current = false), 1500);
  }, []);

  const finishPhase = useCallback((s: State, t: number) => {
    if (s.phase === "BREAK" && s.startedAt) void logSession("BREAK", s.subject, totalSec(s), s.startedAt);
    beep();
    // Desktop app: also drop a line in the taskbar's notification list.
    void window.focusShell?.notify?.(s.phase === "FOCUS" ? "Focus session complete" : "Break finished", s.phase === "FOCUS" ? `Nice work on ${s.subject || "your studies"}. Take a short break.` : "Time to get back to studying.");
    if (s.locked) release();
    const next: Phase = s.phase === "FOCUS" ? "BREAK" : "FOCUS";
    if (typeof Notification !== "undefined" && Notification.permission === "granted")
      new Notification(next === "BREAK" ? "Focus done — take a break ☕" : "Break over — back to work 📚");
    setSt({ ...s, phase: next, running: false, segStart: null, elapsed: 0, startedAt: null, locked: false, runId: null, cycles: s.phase === "FOCUS" ? s.cycles + 1 : s.cycles });
  }, [release]);

  // A focus block only counts as finished when the SERVER agrees enough time was really spent.
  const completing = useRef(false);
  const failedFinishes = useRef(0);
  const completeRun = useCallback(async (s: State) => {
    try {
      const r = await finishFocusRun(s.runId!, "COMPLETE", true);
      failedFinishes.current = 0;
      if (r.ok || r.gone) finishPhase(s, Date.now());
      else setSt((cur) => (cur.runId === s.runId ? { ...cur, elapsed: r.creditedSec ?? cur.elapsed, segStart: Date.now() } : cur)); // not enough real time yet: keep going
    } catch {
      // No connection. After a few failed tries the desktop app records the finished block itself (signed, timed by
      // its own clock) and syncs it when the internet is back; the lock is released only once it has saved it.
      failedFinishes.current += 1;
      if (window.focusShell && failedFinishes.current >= 3 && s.startedAt) {
        try {
          const saved = await window.focusShell.offlineComplete({ subject: s.subject, startedAt: s.startedAt, plannedSec: totalSec(s), claimedSec: Math.min(totalSec(s), usedSec(s, Date.now())), runId: s.runId });
          if (saved.ok) finishPhase(s, Date.now());
        } catch {
          /* try again on the next tick */
        }
      }
    } finally {
      completing.current = false;
    }
  }, [finishPhase]);

  // Heartbeat: tells the server the timer is alive (and whether it is counting). Silence earns no credit.
  useEffect(() => {
    const id = setInterval(async () => {
      const s = stRef.current;
      if (s.phase !== "FOCUS" || !s.runId) return;
      try {
        const r = await beatFocusRun(s.runId, s.running);
        if ("gone" in r && r.gone) setSt((cur) => (cur.runId === s.runId ? { ...cur, runId: null } : cur));
      } catch {
        /* offline: the gap simply earns no credit */
      }
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Tick
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const s = stRef.current;
      if (s.running && s.locked) {
        try { localStorage.setItem(KEY + "_seen", String(t)); } catch {}
      }
      if (s.running && usedSec(s, t) >= totalSec(s)) {
        if (s.phase === "BREAK" || !s.runId) finishPhase(s, t);
        else if (!completing.current) {
          completing.current = true;
          void completeRun(s);
        }
      }
      if (s.sitStart && (t - s.sitStart) / 1000 >= SIT_REMINDER_SEC) setSitAlert(true);
    }, 500);
    return () => clearInterval(id);
  }, [finishPhase, completeRun]);

  // ---------- Strict-mode watchdogs ----------
  const violation = useCallback((kind: "FULLSCREEN_EXIT" | "TAB_SWITCH") => {
    const t = Date.now();
    setSt((s) => (s.locked && s.running ? { ...s, running: false, elapsed: usedSec(s, t), segStart: null } : s));
    void reportLockEvent(kind);
  }, []);

  useEffect(() => {
    const onFs = () => {
      const s = stRef.current;
      if (shell()) return; // the desktop app enforces its own kiosk lock
      if (!releasing.current && s.locked && s.running && fullscreenSupported() && !document.fullscreenElement) violation("FULLSCREEN_EXIT");
    };
    const onVis = () => {
      const s = stRef.current;
      if (document.hidden && s.locked && s.running) violation("TAB_SWITCH");
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      const s = stRef.current;
      if (s.locked && s.running) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);
    const offApp = window.focusShell?.onViolation(() => {
      const s = stRef.current;
      if (s.locked && s.running) violation("TAB_SWITCH"); // window lost focus (Alt+Tab, Win key, …)
    });
    return () => {
      offApp?.();
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [violation]);

  // ---------- Controls ----------
  const [startError, setStartError] = useState("");
  const start = () => {
    const t = Date.now();
    setStartError("");
    const lock = strict && st.phase === "FOCUS";
    const needsRun = st.phase === "FOCUS" && !st.runId;
    const planned = totalSec(st);
    const subject = st.subject;
    // Fullscreen must be requested synchronously inside this click.
    const fs = lock && fullscreenSupported() ? enterFullscreen() : null;
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    setSt((s) => ({
      ...s, running: true, segStart: t, startedAt: s.startedAt ?? t, locked: lock || s.locked,
      sitStart: s.sitStart ?? (s.phase === "FOCUS" ? t : null), // sitting auto-starts with studying
    }));
    fs?.then((ok) => {
      if (!ok) violation("FULLSCREEN_EXIT"); // browser refused full-screen: stay paused behind the overlay
    });
    if (needsRun) {
      const rollback = (msg: string) => {
        if (lock) release();
        setSt((s) => ({ ...s, running: false, segStart: null, elapsed: 0, startedAt: null, locked: false, runId: null }));
        setStartError(msg);
      };
      startFocusRun(subject, planned)
        .then((r) => (r.id ? setSt((s) => ({ ...s, runId: r.id! })) : rollback(r.error ?? "Could not start the session.")))
        .catch(() => rollback("Could not reach the server. Check your connection and try again."));
    }
  };
  /** From the lock overlay: go back to full-screen and carry on. */
  const resumeLocked = () => {
    const fs = fullscreenSupported() ? enterFullscreen() : null;
    const t = Date.now();
    setSt((s) => ({ ...s, running: true, segStart: t }));
    fs?.then((ok) => {
      if (!ok) violation("FULLSCREEN_EXIT");
    });
  };
  const pause = () => {
    const t = Date.now();
    setSt((s) => ({ ...s, running: false, elapsed: usedSec(s, t), segStart: null }));
  };
  const stop = () => {
    saveBlock(st, Date.now()); // partial study time still counts
    if (st.locked) release();
    setSt((s) => ({ ...s, running: false, segStart: null, elapsed: 0, startedAt: null, locked: false, runId: null }));
  };
  const skip = () => {
    saveBlock(st, Date.now());
    setSt((s) => ({ ...s, phase: s.phase === "FOCUS" ? "BREAK" : "FOCUS", running: false, segStart: null, elapsed: 0, startedAt: null, locked: false, runId: null }));
  };
  const endSitting = () => {
    const t = Date.now();
    if (st.sitStart) void logSession("SITTING", "Sitting", (t - st.sitStart) / 1000, st.sitStart);
    setSt((s) => ({ ...s, sitStart: null }));
    setSitAlert(false);
  };
  const startSitting = () => setSt((s) => ({ ...s, sitStart: Date.now() }));

  const remaining = totalSec(st) - usedSec(st, now);
  const sitSec = st.sitStart ? (now - st.sitStart) / 1000 : 0;
  const frac = Math.min(1, usedSec(st, now) / totalSec(st));
  const inBlock = st.running || st.elapsed > 0;
  const focus = st.phase === "FOCUS";
  const lockedRunning = st.locked && st.running;

  if (!ready) return null;

  // ---------- Blocking overlay: a locked block that is not running ----------
  const overlay = st.locked && !st.running && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-bg/95 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Study lock">
      <div className="card w-full max-w-md space-y-4 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-bad-bg text-3xl">🔒</span>
        <div>
          <h2 className="text-xl font-bold">Study lock is on</h2>
          <p className="mt-1 text-sm text-muted">
            You left full-screen, so your timer is paused. Time outside full-screen does not count.
          </p>
        </div>
        <div className="text-5xl font-bold tabular-nums">{mmss(remaining)}</div>
        <p className="text-xs text-muted">remaining · {st.subject || "Focus"}</p>
        <button className="btn w-full !py-3 !text-base" onClick={resumeLocked}>Return to full-screen &amp; continue</button>
        <details className="rounded-xl bg-soft p-3 text-left">
          <summary className="cursor-pointer text-sm font-medium">Need to stop early?</summary>
          <div className="mt-3">
            <UnlockPanel onUnlocked={stop} />
          </div>
        </details>
      </div>
    </div>
  );

  const pill = (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-20 right-3 z-50 flex items-center gap-2 rounded-full bg-gradient-to-br from-accent to-accent-2 py-2.5 pl-3.5 pr-4 text-sm font-semibold tabular-nums text-white shadow-lg lg:bottom-5 lg:right-5"
      aria-label="Open study timer"
    >
      <Icon name="timer" className="h-5 w-5" />
      {mmss(remaining)}
      {lockedRunning ? <span aria-hidden>🔒</span> : st.running && <span className="h-2 w-2 animate-pulse rounded-full bg-white" />}
    </button>
  );

  const widget = (
    <aside className="fixed bottom-20 left-3 right-3 z-50 max-h-[70vh] overflow-y-auto rounded-3xl border border-line bg-surface p-4 shadow-2xl sm:left-auto sm:w-80 lg:bottom-5 lg:right-5">
      <div className="flex items-center justify-between">
        <span className={`badge ${focus ? "bg-accent-soft text-accent" : "bg-ok-bg text-ok-fg"}`}>
          {focus ? "Focus" : "Break"} · round {st.cycles + 1}
        </span>
        <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-soft hover:text-fg" aria-label="Minimize timer">
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      <div className="relative mx-auto my-3 h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--soft)" strokeWidth="9" />
          <circle
            cx="60" cy="60" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
            stroke={focus ? "var(--accent)" : "var(--ok-fg)"}
            strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
            style={{ transition: "stroke-dashoffset 0.5s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{mmss(remaining)}</span>
          <span className="text-xs text-muted">{lockedRunning ? "🔒 locked" : st.running ? "running" : inBlock ? "paused" : "ready"}</span>
        </div>
      </div>

      <input
        className="input"
        placeholder="What are you studying? (e.g. Physics)"
        value={st.subject}
        disabled={focus && inBlock}
        onChange={(e) => setSt((s) => ({ ...s, subject: e.target.value }))}
      />

      {startError && <p className="alert-error mt-3 !text-xs" role="alert">{startError}</p>}

      {lockedRunning ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn-fg">
            🔒 Strict mode: stay in full-screen until the timer ends. Leaving pauses your time.
          </p>
          <details className="rounded-xl bg-soft p-3">
            <summary className="cursor-pointer text-sm font-medium">Need to stop early?</summary>
            <div className="mt-3"><UnlockPanel onUnlocked={stop} /></div>
          </details>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            {st.running ? (
              <button className="btn flex-1" onClick={pause}>Pause</button>
            ) : (
              <button className="btn flex-1" onClick={start} disabled={needApp && focus}>
                {st.elapsed > 0 ? "Resume" : strict && focus ? (desktop ? "Start · lock screen" : "Start · lock full-screen") : "Start"}
              </button>
            )}
            <button className="btn-ghost" onClick={stop} disabled={!st.startedAt}>Stop</button>
            <button className="btn-ghost" onClick={skip} title="Skip to next phase" aria-label="Skip to next phase">
              <Icon name="chevron" className="h-4 w-4" />
            </button>
          </div>
          {needApp && focus ? (
            <p className="alert-error mt-2 !text-xs">Your admin requires the <b>Focus Study Desktop</b> app for focus sessions. Open the app to start the timer.</p>
          ) : (
            strict && focus && <p className="mt-2 text-xs text-muted">🔒 Strict mode is on: starting a focus block locks the screen.</p>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PRESETS.map(([f, b]) => (
          <button
            key={f}
            disabled={inBlock}
            onClick={() => setSt((s) => ({ ...s, focusMin: f, breakMin: b }))}
            className={`chip !px-2.5 !py-1 !text-xs disabled:opacity-50 ${st.focusMin === f && st.breakMin === b ? "chip-active" : ""}`}
          >
            {f}/{b}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-xs text-muted">
          custom
          <input type="number" min={1} max={120} className="input !w-14 !px-1.5 !py-1 !text-xs" value={st.focusMin} disabled={inBlock}
            onChange={(e) => setSt((s) => ({ ...s, focusMin: Math.max(1, Number(e.target.value) || 25) }))} aria-label="Focus minutes" />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn-fg">
        <span>🪑 Sitting: <b>{st.sitStart ? hms(sitSec) : "off"}</b></span>
        <button className="font-semibold underline" onClick={st.sitStart ? endSitting : startSitting}>
          {st.sitStart ? "End" : "Start"}
        </button>
      </div>

      {sitAlert && st.sitStart && (
        <div className="alert-error mt-2 !text-xs">
          You have been sitting for {hms(sitSec)}. Stand up, stretch and drink some water!
          <button className="mt-1 block font-semibold underline" onClick={endSitting}>I stood up</button>
        </div>
      )}
    </aside>
  );

  return (
    <>
      {resumedNotice && (
        <div className="fixed left-1/2 top-4 z-[110] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-white shadow-lg" role="status">
          Your computer restarted — your session continues where it stopped.
        </div>
      )}
      {overlay}
      {open ? widget : pill}
    </>
  );
}
