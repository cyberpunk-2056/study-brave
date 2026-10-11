import Link from "next/link";
import { setGoal } from "@/app/actions/study";
import { Icon } from "@/components/Icon";
import { ExamsCard, TasksCard } from "@/components/Planner";
import { StatTiles, TodayCard, WeekChart } from "@/components/StatsView";
import { VideoCard } from "@/components/VideoCard";
import { all, type Exam, type HistoryVideo, type Task } from "@/lib/db";
import { quoteOfTheDay } from "@/lib/quotes";
import { requireUser } from "@/lib/session";
import type { SessionRow } from "@/lib/stats";

export default async function Overview() {
  const user = await requireUser();
  const [sessions, tasks, exams, recent] = await Promise.all([
    all<SessionRow>("SELECT kind, subject, seconds, startedAt FROM StudySession WHERE userId = ? AND startedAt > ?", user.id, Date.now() - 60 * 86400_000),
    all<Task>("SELECT * FROM Task WHERE userId = ? ORDER BY done, createdAt DESC", user.id),
    all<Exam>("SELECT * FROM Exam WHERE userId = ? AND examDate >= to_char(CURRENT_DATE - 1, 'YYYY-MM-DD') ORDER BY examDate LIMIT 3", user.id),
    all<HistoryVideo>("SELECT * FROM WatchHistory WHERE userId = ? ORDER BY watchedAt DESC LIMIT 4", user.id),
  ]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-accent-2 p-6 text-white sm:p-8">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
        <h1 className="relative text-2xl font-bold sm:text-3xl">{greeting}, {user.name.split(" ")[0]} 👋</h1>
        <p className="relative mt-1 max-w-xl text-white/85">“{quoteOfTheDay()}”</p>
        <div className="relative mt-5 flex flex-wrap gap-2">
          <Link href="/videos" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#3f3fc4]">
            <Icon name="video" className="h-4 w-4" /> Start learning
          </Link>
          <Link href="/planner" className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/30">
            <Icon name="tasks" className="h-4 w-4" /> Plan my day
          </Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_2fr]">
        <TodayCard sessions={sessions} goalMin={user.dailyGoalMin} />
        <StatTiles sessions={sessions} goalMin={user.dailyGoalMin} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TasksCard tasks={tasks} limit={5} showLink />
        <ExamsCard exams={exams} withForm={false} />
      </div>

      {recent.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Continue watching</h2>
            <Link href="/history" className="text-sm text-accent hover:underline">See all</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((h) => (
              <VideoCard key={h.videoId} v={{ id: h.videoId, title: h.title, thumbnail: h.thumbnail, channelTitle: h.channelTitle, channelId: h.channelId, duration: h.duration }} />
            ))}
          </div>
        </section>
      )}

      <WeekChart sessions={sessions} goalMin={user.dailyGoalMin} showSitting={false} />

      <form action={setGoal} className="card flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium" htmlFor="minutes">Daily focus goal (minutes)</label>
        <input id="minutes" name="minutes" type="number" min={10} max={1000} defaultValue={user.dailyGoalMin} className="input !w-28" />
        <button className="btn-ghost">Save goal</button>
      </form>
    </div>
  );
}
