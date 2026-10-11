"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { PRESETS, UnlockPanel, useTimer } from "./TimerProvider";
import { hms, mmss } from "./util";

const R = 52;
const C = 2 * Math.PI * R;

/**
 * The Pomodoro timer UI. `sidebar` is the compact card that sits above "Log out" in the left menu;
 * `floating` is the larger version used in the pop-up on phones. Both control the same timer.
 */
export function TimerCard({ variant }: { variant: "sidebar" | "floating" }) {
  const t = useTimer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSettingsOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsOpen]);
  const { st, focus, remaining, frac, lockedRunning, inBlock, strict, desktop, needApp } = t;
  const side = variant === "sidebar";
  const status = lockedRunning ? "🔒 locked" : st.running ? "running" : inBlock ? "paused" : "ready";

  const startLabel = st.elapsed > 0 ? "Resume" : strict && focus ? (side ? "Start" : desktop ? "Start · lock screen" : "Start · lock full-screen") : "Start";

  const subjectInput = (
    <input
      className={`input ${side ? "!py-2 !text-[13px]" : ""}`}
      placeholder={side ? "Subject (e.g. Physics)" : "What are you studying? (e.g. Physics)"}
      value={st.subject}
      disabled={focus && inBlock}
      maxLength={40}
      onChange={(e) => t.setSubject(e.target.value)}
      aria-label="Study subject"
    />
  );

  const controls = lockedRunning ? (
    <div className="space-y-2">
      <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn-fg">🔒 Strict mode: stay in full-screen until the timer ends. Leaving pauses your time.</p>
      <details className="rounded-xl bg-soft p-3">
        <summary className="cursor-pointer text-sm font-medium">Need to stop early?</summary>
        <div className="mt-3"><UnlockPanel onUnlocked={t.stop} /></div>
      </details>
    </div>
  ) : (
    <>
      <div className="flex gap-2">
        {st.running ? (
          <button className="btn flex-1 !py-2" onClick={t.pause}>Pause</button>
        ) : (
          <button className="btn flex-1 !py-2" onClick={t.start} disabled={needApp && focus}>{startLabel}</button>
        )}
        <button className="btn-ghost !px-3" onClick={t.stop} disabled={!st.startedAt} aria-label="Stop and save" title="Stop and save">
          {side ? <span className="block h-3 w-3 rounded-[3px] bg-current" /> : "Stop"}
        </button>
        <button className="btn-ghost !px-3" onClick={t.skip} title="Skip to next phase" aria-label="Skip to next phase">
          <Icon name="chevron" className="h-4 w-4" />
        </button>
      </div>
      {needApp && focus && (
        <p className="alert-error mt-2 !text-xs">Your admin requires the <b>Focus Study Desktop</b> app for focus sessions.</p>
      )}
      {!needApp && strict && focus && !side && <p className="mt-2 text-xs text-muted">🔒 Strict mode is on: starting a focus block locks the screen.</p>}
    </>
  );

  const presets = (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map(([f, b]) => (
        <button
          key={f}
          disabled={inBlock}
          onClick={() => t.setPreset(f, b)}
          className={`chip !px-2.5 !py-1 !text-xs disabled:opacity-50 ${st.focusMin === f && st.breakMin === b ? "chip-active" : ""}`}
        >
          {f}/{b}
        </button>
      ))}
      <label className="ml-auto flex items-center gap-1 text-xs text-muted">
        custom
        <input
          type="number" min={1} max={120} className="input !w-14 !px-1.5 !py-1 !text-xs" value={st.focusMin} disabled={inBlock}
          onChange={(e) => t.setFocusMin(Number(e.target.value))} aria-label="Focus minutes"
        />
      </label>
    </div>
  );

  const sitting = (
    <>
      <div className="flex items-center justify-between rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn-fg">
        <span>🪑 Sitting: <b>{st.sitStart ? hms(t.sitSec) : "off"}</b></span>
        <button className="font-semibold underline" onClick={st.sitStart ? t.endSitting : t.startSitting}>{st.sitStart ? "End" : "Start"}</button>
      </div>
      {t.sitAlert && st.sitStart && (
        <div className="alert-error mt-2 !text-xs">
          You have been sitting for {hms(t.sitSec)}. Stand up, stretch and drink some water!
          <button className="mt-1 block font-semibold underline" onClick={t.endSitting}>I stood up</button>
        </div>
      )}
    </>
  );

  if (!t.ready) {
    // Same size as the real card so the left menu does not jump when the timer finishes loading.
    return <div className={`rounded-2xl border border-line bg-soft/60 ${side ? "h-[176px]" : "h-64"} animate-pulse`} aria-hidden />;
  }

  if (side) {
    // The left menu only needs Start/Pause and Stop. Everything else (subject, skip, presets, sitting timer,
    // and — while locked — the "stop early" code) lives behind the settings button, in a panel on the right.
    const compactControls = lockedRunning ? (
      <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn-fg">🔒 Locked until the timer ends. Open settings to stop early.</p>
    ) : (
      <div className="flex gap-2">
        {st.running ? (
          <button className="btn flex-1 !py-2" onClick={t.pause}>Pause</button>
        ) : (
          <button className="btn flex-1 !py-2" onClick={t.start} disabled={needApp && focus}>{startLabel}</button>
        )}
        <button className="btn-ghost !px-3" onClick={t.stop} disabled={!st.startedAt} aria-label="Stop and save" title="Stop and save">
          <span className="block h-3 w-3 rounded-[3px] bg-current" />
        </button>
      </div>
    );

    return (
      <>
        <section className="rounded-2xl border border-line bg-soft/60 p-3" aria-label="Pomodoro timer">
          <div className="flex items-center justify-between">
            <span className={`badge ${focus ? "bg-accent-soft text-accent" : "bg-ok-bg text-ok-fg"}`}>{focus ? "Focus" : "Break"} · round {st.cycles + 1}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted">{status}</span>
              <button
                className="rounded-md p-1 text-muted hover:bg-line/60 hover:text-fg"
                onClick={() => setSettingsOpen(true)}
                aria-label="Pomodoro timer settings"
                title="Timer settings"
              >
                <Icon name="settings" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-1 text-center text-4xl font-bold leading-tight tabular-nums">{mmss(remaining)}</div>
          <div className="mb-2.5 mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
            <div className={`h-full rounded-full ${focus ? "bg-gradient-to-r from-accent to-accent-2" : "bg-ok-fg"} transition-[width] duration-500 ease-linear`} style={{ width: `${frac * 100}%` }} />
          </div>
          <div className="space-y-2">
            {t.startError && <p className="alert-error !text-xs" role="alert">{t.startError}</p>}
            {needApp && focus && <p className="alert-error !text-xs">Your admin requires the <b>Focus Study Desktop</b> app for focus sessions.</p>}
            {compactControls}
          </div>
        </section>

        {settingsOpen && (
          <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Pomodoro timer settings">
            <button className="backdrop-enter absolute inset-0 bg-bg/60 backdrop-blur-sm" aria-label="Close" onClick={() => setSettingsOpen(false)} />
            <div className="drawer-enter absolute inset-y-0 right-0 flex w-full max-w-sm flex-col gap-4 overflow-y-auto border-l border-line bg-bg p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Pomodoro timer settings</h2>
                <button className="btn-ghost !px-2.5" onClick={() => setSettingsOpen(false)} aria-label="Close"><Icon name="x" className="h-4 w-4" /></button>
              </div>

              <div className="text-center">
                <span className={`badge ${focus ? "bg-accent-soft text-accent" : "bg-ok-bg text-ok-fg"}`}>{focus ? "Focus" : "Break"} · round {st.cycles + 1}</span>
                <div className="mt-2 text-5xl font-bold tabular-nums">{mmss(remaining)}</div>
                <p className="mt-1 text-xs text-muted">{status}</p>
              </div>

              {subjectInput}

              {lockedRunning ? (
                <div className="space-y-2">
                  <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn-fg">🔒 Strict mode: stay in full-screen until the timer ends. Leaving pauses your time.</p>
                  <details className="rounded-xl bg-soft p-3" open>
                    <summary className="cursor-pointer text-sm font-medium">Need to stop early?</summary>
                    <div className="mt-3"><UnlockPanel onUnlocked={() => { t.stop(); setSettingsOpen(false); }} /></div>
                  </details>
                </div>
              ) : (
                <div className="flex gap-2">
                  {st.running ? (
                    <button className="btn flex-1 !py-2" onClick={t.pause}>Pause</button>
                  ) : (
                    <button className="btn flex-1 !py-2" onClick={t.start} disabled={needApp && focus}>{startLabel}</button>
                  )}
                  <button className="btn-ghost !px-3" onClick={t.stop} disabled={!st.startedAt} aria-label="Stop and save" title="Stop and save">Stop</button>
                  <button className="btn-ghost !px-3" onClick={t.skip} title="Skip to next phase" aria-label="Skip to next phase">
                    <Icon name="chevron" className="h-4 w-4" />
                  </button>
                </div>
              )}
              {strict && focus && !lockedRunning && <p className="text-xs text-muted">🔒 Strict mode is on: starting a focus block locks the screen.</p>}

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Focus / break length</h3>
                {presets}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Sitting timer</h3>
                {sitting}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div aria-label="Pomodoro timer">
      <div className="flex items-center justify-between">
        <span className={`badge ${focus ? "bg-accent-soft text-accent" : "bg-ok-bg text-ok-fg"}`}>{focus ? "Focus" : "Break"} · round {st.cycles + 1}</span>
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
          <span className="text-xs text-muted">{status}</span>
        </div>
      </div>
      <div className="space-y-3">
        {subjectInput}
        {t.startError && <p className="alert-error !text-xs" role="alert">{t.startError}</p>}
        <div>{controls}</div>
        {presets}
        <div>{sitting}</div>
      </div>
    </div>
  );
}
