"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { setGoal } from "@/app/actions/study";
import { Icon, type IconName } from "./Icon";

type SettingsUser = {
  name: string;
  email: string;
  role: "STUDENT" | "ADMIN";
  dailyGoalMin: number;
  strictMode: number;
  parentEmail: string | null;
};

const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1•••$2");

/** One tappable row, mobile-settings style: icon, label, a value or chevron on the right. */
function Row({
  icon, label, sub, right, onClick, href, tone = "default",
}: {
  icon: IconName; label: string; sub?: string; right?: React.ReactNode; onClick?: () => void; href?: string; tone?: "default" | "danger";
}) {
  const inner = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone === "danger" ? "bg-bad-bg text-bad-fg" : "bg-soft text-accent"}`}>
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${tone === "danger" ? "text-bad-fg" : "text-fg"}`}>{label}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {right ?? ((href || onClick) && <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />)}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-soft";
  return href ? (
    <Link href={href} className={cls} onClick={onClick}>{inner}</Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>{inner}</button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
    </div>
  );
}

/** iOS/Android-style on-off switch. */
function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function SettingsPanel({ user, variant = "row" }: { user: SettingsUser; variant?: "row" | "tile" }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default");
  const [goal, setGoalInput] = useState(user.dailyGoalMin);
  const [goalSaved, setGoalSaved] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    setNotifPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("fs_theme", next);
    } catch {}
    setTheme(next);
  };

  const askNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    setNotifPerm(r);
  };

  return (
    <>
      {variant === "tile" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-20 flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-white/10 focus-visible:bg-white/10 sm:w-24"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft text-fg shadow-sm transition group-hover:scale-105 sm:h-14 sm:w-14">
            <Icon name="settings" className="h-6 w-6" />
          </span>
          <span className="line-clamp-2 text-xs font-medium text-fg drop-shadow sm:text-sm">Settings</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-soft hover:text-fg"
        >
          <Icon name="settings" />
          Settings
        </button>
      )}

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Settings">
          <button className="backdrop-enter absolute inset-0 bg-bg/60 backdrop-blur-sm" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="drawer-enter absolute inset-y-0 right-0 flex w-full max-w-sm flex-col gap-5 overflow-y-auto border-l border-line bg-bg p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Settings</h2>
              <button className="btn-ghost !px-2.5" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" className="h-4 w-4" /></button>
            </div>

            <Section title="Appearance">
              <Row
                icon={theme === "dark" ? "moon" : "sun"}
                label="Dark mode"
                right={theme !== null && <Switch on={theme === "dark"} onClick={toggleTheme} label="Dark mode" />}
              />
            </Section>

            <Section title="Notifications">
              <Row
                icon="megaphone"
                label="Desktop notifications"
                sub={
                  notifPerm === "unsupported" ? "Not supported on this device" :
                  notifPerm === "granted" ? "On — messages & reminders will notify you" :
                  notifPerm === "denied" ? "Blocked — turn on in your browser's site settings" :
                  "Off — turn on to get reminders"
                }
                right={
                  notifPerm === "default" ? (
                    <button className="chip !px-3 !py-1 !text-xs" onClick={askNotifications}>Enable</button>
                  ) : notifPerm === "granted" ? (
                    <Icon name="check" className="h-4 w-4 text-ok-fg" />
                  ) : undefined
                }
              />
            </Section>

            <Section title="Study">
              <form
                action={setGoal}
                onSubmit={() => setGoalSaved(true)}
                className="flex items-center gap-3 px-3.5 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-soft text-accent"><Icon name="target" className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <label htmlFor="settings-goal" className="block text-sm font-medium">Daily focus goal</label>
                  <span className="block text-xs text-muted">minutes per day</span>
                </span>
                <input
                  id="settings-goal" name="minutes" type="number" min={10} max={1000}
                  value={goal} onChange={(e) => { setGoalInput(Number(e.target.value)); setGoalSaved(false); }}
                  className="input !w-16 !px-2 !py-1.5 !text-sm"
                />
                <button className="chip !px-3 !py-1 !text-xs">{goalSaved ? "Saved" : "Save"}</button>
              </form>
              {user.role === "STUDENT" && (
                <Row
                  icon="shield"
                  label="Study lock"
                  sub={
                    user.strictMode === 2 ? "On · desktop app required" :
                    user.strictMode === 1 ? "On · full-screen while studying" :
                    "Off — set by your admin"
                  }
                  right={<span className="text-xs text-muted">{user.strictMode ? "🔒" : ""}</span>}
                />
              )}
            </Section>

            <Section title="Account">
              <Row icon="user" label={user.name} sub={user.parentEmail ? `${maskEmail(user.email)} · parent linked` : user.email} href="/profile" onClick={() => setOpen(false)} />
              <Row icon="shield" label="Change password" href="/profile" onClick={() => setOpen(false)} />
              <Row icon="compass" label="Manage study channels" sub="Remove channels on your Profile page" href="/profile" onClick={() => setOpen(false)} />
              <Row icon="logout" label="Log out" sub="Opens on your Profile page" href="/profile" onClick={() => setOpen(false)} />
            </Section>

            {user.role === "STUDENT" && (
              <Section title="Help">
                <Row icon="chat" label="Contact support" sub="Message your admin with any question" href="/support" onClick={() => setOpen(false)} />
              </Section>
            )}

            {user.role === "ADMIN" && (
              <Section title="Admin">
                <Row icon="shield" label="Admin panel" href="/admin" onClick={() => setOpen(false)} />
              </Section>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
