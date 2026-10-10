export type SessionRow = { kind: string; subject: string; seconds: number; startedAt: number };

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function fmtDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Study heatmap: `weeks` columns (oldest first) of 7 days each (Mon to Sun), focus minutes per day. */
export function computeHeatmap(sessions: SessionRow[], weeks = 14) {
  const perDay = new Map<string, number>();
  for (const s of sessions) if (s.kind === "FOCUS") perDay.set(dayKey(s.startedAt), (perDay.get(dayKey(s.startedAt)) ?? 0) + s.seconds / 60);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7; // Monday = 0
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7);

  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      col.push({ date, min: Math.round(perDay.get(dayKey(date.getTime())) ?? 0), future: date > today });
    }
    cols.push(col);
  }
  return cols;
}

/** Computed in the browser so "today" matches the student's own timezone. */
export function computeStats(sessions: SessionRow[], goalMin: number, days = 7) {
  const sumBy = (kind: string) => {
    const map = new Map<string, number>();
    for (const s of sessions) if (s.kind === kind) map.set(dayKey(s.startedAt), (map.get(dayKey(s.startedAt)) ?? 0) + s.seconds);
    return map;
  };
  const focus = sumBy("FOCUS");
  const sitting = sumBy("SITTING");

  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = dayKey(d.getTime());
    return {
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      focusMin: Math.round((focus.get(key) ?? 0) / 60),
      sitMin: Math.round((sitting.get(key) ?? 0) / 60),
    };
  });

  let streak = 0;
  const cursor = new Date();
  if (!focus.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1); // today may not have started yet
  while (focus.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const cutoff = Date.now() - days * 86400_000;
  const subjects = new Map<string, number>();
  for (const s of sessions) if (s.kind === "FOCUS" && s.startedAt >= cutoff) subjects.set(s.subject, (subjects.get(s.subject) ?? 0) + s.seconds);

  const weekFocusMin = series.reduce((a, d) => a + d.focusMin, 0);
  const best = series.reduce((a, d) => (d.focusMin > a.focusMin ? d : a), series[0]);
  return {
    series,
    streak,
    todayMin: series[series.length - 1].focusMin,
    todaySitMin: series[series.length - 1].sitMin,
    weekFocusMin,
    weekSitMin: series.reduce((a, d) => a + d.sitMin, 0),
    avgMin: Math.round(weekFocusMin / days),
    daysGoalHit: series.filter((d) => d.focusMin >= goalMin).length,
    best,
    subjects: [...subjects.entries()].sort((a, b) => b[1] - a[1]).map(([name, sec]) => ({ name, min: Math.round(sec / 60) })),
    goalMin,
  };
}
