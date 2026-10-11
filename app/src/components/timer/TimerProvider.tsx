"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { beatFocusRun, finishFocusRun, startFocusRun } from "@/app/actions/focus";
import { reportLockEvent, requestUnlockCode, verifyUnlockCode, type LockResult } from "@/app/actions/lock";
import { logSession } from "@/app/actions/study";
import { beep, enterFullscreen, fullscreenSupported, leaveFullscreen, mmss, shell } from "./util";

// ONE timer engine for the whole app. The sidebar card, the floating phone widget and the desktop taskbar all show
// and control this same state, so they can never disagree.

type Phase = "FOCUS" | "BREAK";
export type TimerState = {
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
export const PRESETS: [number, number][] = [[25, 5], [50, 10], [90, 15]];
const initial: TimerState = {
  phase: "FOCUS", running: false, segStart: null, elapsed: 0, startedAt: null,
  subject: "", focusMin: 25, breakMin: 5, cycles: 0, sitStart: null, locked: false, runId: null,
};

const totalSec = (s: TimerState) => (s.phase === "FOCUS" ? s.focusMin : s.breakMin) * 60;
const usedSec = (s: TimerState, t: number) => s.elapsed + (s.running && s.segStart ? (t - s.segStart) / 1000 : 0);

export type TimerApi = {
  ready: boolean;
  st: TimerState;
  remaining: number;
  total: number;
  frac: number;
  inBlock: boolean;
  focus: boolean;
  lockedRunning: boolean;
  strict: boolean;
  desktop: boolean;
  needApp: boolean;
  startError: string;
  sitAlert: boolean;
  sitSec: number;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  skip: () => void;
  resumeLocked: () => void;
  endSitting: () => void;
  startSitting: () => void;
  setSubject: (s: string) => void;
  setPreset: (focusMin: number, breakMin: number) => void;
  setFocusMin: (n: number) => void;
};

const Ctx = createContext<TimerApi | null>(null);

export function useTimer(): TimerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTimer must be used inside <TimerProvider>");
  return v;
}

/** Ask for a code (emailed to parent + admin) and enter it to stop early. */
export function UnlockPanel({ onUnlocked }: { onUnlocked: () => void }) {
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
      <p className="text-muted">To stop early you need a 6-digit code. It is emailed to your parent and your admin — not to you.</p>
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

function useTimerEngine(level: number): TimerApi & { resumedNotice: boolean } {
  const strict = level >= 1;
  const [st, setSt] = useState<TimerState>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [sitAlert, setSitAlert] = useState(false);
  const [resumedNotice, setResumedNotice] = useState(false);
  const [startError, setStartError] = useState("");
  const [desktop, setDesktop] = useState(false); // running inside Focus Study Desktop
  const stRef = useRef(st);
  stRef.current = st;
  const releasing = useRef(false); // true while WE are leaving full-screen on purpose
  const needApp = level === 2 && !desktop;

  // Restore after refresh / navigation.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      let s: TimerState = raw ? { ...initial, ...JSON.parse(raw) } : initial;
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
    } catch {
      /* storage unavailable: start fresh */
    }
    setReady(true);
  }, [strict]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {
      /* storage full or blocked */
    }
  }, [st, ready]);

  const saveBlock = useCallback((s: TimerState, t: number) => {
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

  const finishPhase = useCallback((s: TimerState) => {
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
  const completeRun = useCallback(async (s: TimerState) => {
    try {
      const r = await finishFocusRun(s.runId!, "COMPLETE", true);
      failedFinishes.current = 0;
      if (r.ok || r.gone) finishPhase(s);
      else setSt((cur) => (cur.runId === s.runId ? { ...cur, elapsed: r.creditedSec ?? cur.elapsed, segStart: Date.now() } : cur)); // not enough real time yet: keep going
    } catch {
      // No connection. After a few failed tries the desktop app records the finished block itself (signed, timed by
      // its own clock) and syncs it when the internet is back; the lock is released only once it has saved it.
      failedFinishes.current += 1;
      if (window.focusShell && failedFinishes.current >= 3 && s.startedAt) {
        try {
          const saved = await window.focusShell.offlineComplete({ subject: s.subject, startedAt: s.startedAt, plannedSec: totalSec(s), claimedSec: Math.min(totalSec(s), usedSec(s, Date.now())), runId: s.runId });
          if (saved.ok) finishPhase(s);
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
        try {
          localStorage.setItem(KEY + "_seen", String(t));
        } catch {
          /* ignore */
        }
      }
      if (s.running && usedSec(s, t) >= totalSec(s)) {
        if (s.phase === "BREAK" || !s.runId) finishPhase(s);
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
  const start = () => {
    const t = Date.now();
    setStartError("");
    const cur = stRef.current;
    const lock = strict && cur.phase === "FOCUS";
    const needsRun = cur.phase === "FOCUS" && !cur.runId;
    const planned = totalSec(cur);
    const subject = cur.subject;
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
    const cur = stRef.current;
    saveBlock(cur, Date.now()); // partial study time still counts
    if (cur.locked) release();
    setSt((s) => ({ ...s, running: false, segStart: null, elapsed: 0, startedAt: null, locked: false, runId: null }));
  };

  const skip = () => {
    saveBlock(stRef.current, Date.now());
    setSt((s) => ({ ...s, phase: s.phase === "FOCUS" ? "BREAK" : "FOCUS", running: false, segStart: null, elapsed: 0, startedAt: null, locked: false, runId: null }));
  };

  /** One button for the taskbar: pause when running (never while locked), otherwise start / resume. */
  const toggle = () => {
    const cur = stRef.current;
    if (cur.running) {
      if (!cur.locked) pause();
    } else if (!(cur.locked) && !(level === 2 && !shell())) start();
  };

  const endSitting = () => {
    const cur = stRef.current;
    if (cur.sitStart) void logSession("SITTING", "Sitting", (Date.now() - cur.sitStart) / 1000, cur.sitStart);
    setSt((s) => ({ ...s, sitStart: null }));
    setSitAlert(false);
  };
  const startSitting = () => setSt((s) => ({ ...s, sitStart: Date.now() }));

  const total = totalSec(st);
  const used = usedSec(st, now);

  // ---------- Desktop taskbar: show this timer in the app's bottom bar and accept its Start/Pause clicks ----------
  const api = useRef({ toggle });
  api.current = { toggle };
  useEffect(() => {
    const app = window.focusShell;
    if (!app?.timerUpdate) return;
    const send = () => {
      const s = stRef.current;
      const t = Date.now();
      void app.timerUpdate({
        source: "web",
        phase: s.phase,
        running: s.running,
        locked: s.locked,
        remainingSec: Math.max(0, totalSec(s) - usedSec(s, t)),
        totalSec: totalSec(s),
        subject: s.subject,
        round: s.cycles + 1,
        started: !!s.startedAt || s.elapsed > 0,
      });
    };
    send();
    const id = setInterval(send, 1000);
    const off = app.onTimerCommand?.((cmd) => cmd === "toggle" && api.current.toggle());
    return () => {
      clearInterval(id);
      off?.();
    };
  }, []);

  return {
    ready,
    st,
    remaining: total - used,
    total,
    frac: Math.min(1, used / total),
    inBlock: st.running || st.elapsed > 0,
    focus: st.phase === "FOCUS",
    lockedRunning: st.locked && st.running,
    strict,
    desktop,
    needApp,
    startError,
    sitAlert,
    sitSec: st.sitStart ? (now - st.sitStart) / 1000 : 0,
    resumedNotice,
    start, pause, toggle, stop, skip, resumeLocked, endSitting, startSitting,
    setSubject: (subject) => setSt((s) => ({ ...s, subject })),
    setPreset: (focusMin, breakMin) => setSt((s) => ({ ...s, focusMin, breakMin })),
    setFocusMin: (n) => setSt((s) => ({ ...s, focusMin: Math.max(1, Math.min(120, Math.floor(n) || 25)) })),
  };
}

export function TimerProvider({ level = 0, children }: { level?: number; children: React.ReactNode }) {
  const { resumedNotice, ...api } = useTimerEngine(level);
  const { st, ready, remaining } = api;

  // Blocking overlay: a locked block that is not running (left full-screen, reloaded, app restarted)
  const overlay = ready && st.locked && !st.running && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-bg/95 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Study lock">
      <div className="card w-full max-w-md space-y-4 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-bad-bg text-3xl">🔒</span>
        <div>
          <h2 className="text-xl font-bold">Study lock is on</h2>
          <p className="mt-1 text-sm text-muted">You left full-screen, so your timer is paused. Time outside full-screen does not count.</p>
        </div>
        <div className="text-5xl font-bold tabular-nums">{mmss(remaining)}</div>
        <p className="text-xs text-muted">remaining · {st.subject || "Focus"}</p>
        <button className="btn w-full !py-3 !text-base" onClick={api.resumeLocked}>Return to full-screen &amp; continue</button>
        <details className="rounded-xl bg-soft p-3 text-left">
          <summary className="cursor-pointer text-sm font-medium">Need to stop early?</summary>
          <div className="mt-3">
            <UnlockPanel onUnlocked={api.stop} />
          </div>
        </details>
      </div>
    </div>
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {resumedNotice && (
        <div className="fixed left-1/2 top-4 z-[110] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-white shadow-lg" role="status">
          Your computer restarted — your session continues where it stopped.
        </div>
      )}
      {overlay}
    </Ctx.Provider>
  );
}
