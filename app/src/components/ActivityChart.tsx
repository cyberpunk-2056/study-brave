"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ActivityPoint = { day: string; focusHours: number; activeStudents: number };

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="fillFocus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={12} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--fg)" }} />
          <Area type="monotone" dataKey="focusHours" name="Focus hours" stroke="var(--accent)" strokeWidth={2.5} fill="url(#fillFocus)" />
          <Area type="monotone" dataKey="activeStudents" name="Active students" stroke="var(--accent-2)" strokeWidth={2} fill="none" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
