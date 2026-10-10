"use client";

import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { computeHeatmap, computeStats, fmtDuration, type SessionRow } from "@/lib/stats";
import { Icon, type IconName } from "./Icon";

export function Ring({ pct, size = 140, children }: { pct: number; size?: number; children?: React.ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--soft)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct / 100))} style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function TodayCard({ sessions, goalMin }: { sessions: SessionRow[]; goalMin: number }) {
  const s = computeStats(sessions, goalMin);
  const pct = Math.round((s.todayMin / goalMin) * 100);
  return (
    <div className="card flex items-center gap-5">
      <Ring pct={pct}>
        <span className="text-2xl font-bold">{Math.min(pct, 999)}%</span>
        <span className="text-xs text-muted">of goal</span>
      </Ring>
      <div className="min-w-0">
        <div className="text-sm text-muted">Today&apos;s focus</div>
        <div className="text-3xl font-bold">{fmtDuration(s.todayMin * 60)}</div>
        <div className="text-sm text-muted">Goal {fmtDuration(goalMin * 60)}</div>
        <div className="mt-1 text-sm font-medium text-accent">
          {pct >= 100 ? "Goal reached 🎉" : `${fmtDuration(Math.max(0, goalMin - s.todayMin) * 60)} to go`}
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint?: string }) {
  return (
    <div className="card !p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function StatTiles({ sessions, goalMin }: { sessions: SessionRow[]; goalMin: number }) {
  const s = computeStats(sessions, goalMin);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile icon="timer" label="This week" value={fmtDuration(s.weekFocusMin * 60)} hint={`avg ${fmtDuration(s.avgMin * 60)}/day`} />
      <Tile icon="flame" label="Streak" value={`${s.streak} day${s.streak === 1 ? "" : "s"}`} hint="days in a row" />
      <Tile icon="target" label="Goal hit" value={`${s.daysGoalHit}/7`} hint={s.best.focusMin ? `best: ${s.best.day} · ${fmtDuration(s.best.focusMin * 60)}` : "this week"} />
      <Tile icon="users" label="Sitting" value={fmtDuration(s.weekSitMin * 60)} hint={`today ${fmtDuration(s.todaySitMin * 60)}`} />
    </div>
  );
}

export function WeekChart({ sessions, goalMin, showSitting = true }: { sessions: SessionRow[]; goalMin: number; showSitting?: boolean }) {
  const s = computeStats(sessions, goalMin);
  return (
    <div className="card">
      <h3 className="mb-3 font-semibold">
        Last 7 days <span className="font-normal text-muted">(minutes)</span>
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={s.series} margin={{ left: -20, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={12} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={12} />
            <Tooltip cursor={{ fill: "var(--soft)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--fg)" }} />
            {showSitting && <Legend />}
            <ReferenceLine y={goalMin} stroke="var(--ok-fg)" strokeDasharray="4 4" />
            <Bar dataKey="focusMin" name="Focus" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            {showSitting && <Bar dataKey="sitMin" name="Sitting" fill="#f59e0b" radius={[6, 6, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-muted">Dashed line = daily goal.</p>
    </div>
  );
}

export function Subjects({ sessions, goalMin }: { sessions: SessionRow[]; goalMin: number }) {
  const s = computeStats(sessions, goalMin);
  const max = Math.max(1, ...s.subjects.map((x) => x.min));
  return (
    <div className="card">
      <h3 className="mb-3 font-semibold">
        Time per subject <span className="font-normal text-muted">(last 7 days)</span>
      </h3>
      {s.subjects.length === 0 ? (
        <p className="text-sm text-muted">No focus sessions yet. Start the timer and type a subject.</p>
      ) : (
        <ul className="space-y-3">
          {s.subjects.map((x) => (
            <li key={x.name}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{x.name}</span>
                <span className="text-muted">{fmtDuration(x.min * 60)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-soft">
                <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${(x.min / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MIX = [0, 25, 45, 70, 100];
const level = (m: number) => (m === 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4);
const shade = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, var(--soft))`;

export function Heatmap({ sessions }: { sessions: SessionRow[] }) {
  const cols = computeHeatmap(sessions);
  return (
    <div className="card">
      <h3 className="mb-3 font-semibold">
        Study heatmap <span className="font-normal text-muted">(last 14 weeks)</span>
      </h3>
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max gap-1">
          {cols.map((col, i) => (
            <div key={i} className="flex flex-col gap-1">
              {col.map((d, j) => (
                <div
                  key={j}
                  title={`${d.date.toLocaleDateString()}: ${d.min} min`}
                  className="h-4 w-4 rounded-[4px] sm:h-5 sm:w-5"
                  style={{ background: d.future ? "transparent" : shade(MIX[level(d.min)]) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        Less
        {MIX.map((m) => (
          <span key={m} className="h-3.5 w-3.5 rounded-[4px]" style={{ background: shade(m) }} />
        ))}
        More
      </div>
    </div>
  );
}

/** Full analytics layout (also used on the admin's per-student page). */
export function StatsView({ sessions, goalMin }: { sessions: SessionRow[]; goalMin: number }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_2fr]">
        <TodayCard sessions={sessions} goalMin={goalMin} />
        <StatTiles sessions={sessions} goalMin={goalMin} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <WeekChart sessions={sessions} goalMin={goalMin} />
        <Subjects sessions={sessions} goalMin={goalMin} />
      </div>
      <Heatmap sessions={sessions} />
    </div>
  );
}
