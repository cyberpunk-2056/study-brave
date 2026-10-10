import Link from "next/link";
import { addExam, addTask, clearDoneTasks, deleteExam, deleteTask, toggleTask } from "@/app/actions/planner";
import type { Exam, Task } from "@/lib/db";
import { Icon } from "./Icon";

export function TasksCard({ tasks, limit, showLink = false }: { tasks: Task[]; limit?: number; showLink?: boolean }) {
  const shown = limit ? tasks.slice(0, limit) : tasks;
  const doneCount = tasks.filter((t) => t.done).length;
  return (
    <div className="card flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">To-do list</h2>
        <span className="text-xs text-muted">{doneCount}/{tasks.length} done</span>
      </div>
      <form action={addTask} className="mb-3 flex gap-2">
        <input name="title" required maxLength={120} className="input" placeholder="Add a task, e.g. Finish Chapter 4" aria-label="New task" />
        <button className="btn !px-3" aria-label="Add task"><Icon name="plus" /></button>
      </form>
      <ul className="flex-1 space-y-1">
        {shown.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-soft">
            <form action={toggleTask}>
              <input type="hidden" name="id" value={t.id} />
              <button
                aria-label={t.done ? "Mark as not done" : "Mark as done"}
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${
                  t.done ? "border-transparent bg-gradient-to-br from-accent to-accent-2 text-white" : "border-line hover:border-accent"
                }`}
              >
                {t.done ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
              </button>
            </form>
            <span className={`flex-1 break-words text-sm ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
            <form action={deleteTask}>
              <input type="hidden" name="id" value={t.id} />
              <button className="rounded p-1 text-muted opacity-60 hover:text-bad-fg hover:opacity-100" aria-label="Delete task">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </form>
          </li>
        ))}
      </ul>
      {tasks.length === 0 && <p className="py-4 text-center text-sm text-muted">Nothing planned yet. Add your first task above ✨</p>}
      <div className="mt-3 flex items-center justify-between text-sm">
        {limit && tasks.length > limit ? <Link href="/planner" className="text-accent hover:underline">+{tasks.length - limit} more</Link> : <span />}
        {showLink && <Link href="/planner" className="text-accent hover:underline">Open planner</Link>}
        {doneCount > 0 && !limit && (
          <form action={clearDoneTasks}>
            <button className="text-muted hover:text-fg hover:underline">Clear completed</button>
          </form>
        )}
      </div>
    </div>
  );
}

function daysLeft(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86400_000);
}

export function ExamsCard({ exams, withForm = true }: { exams: Exam[]; withForm?: boolean }) {
  const sorted = [...exams].sort((a, b) => a.examDate.localeCompare(b.examDate));
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">Exam countdown</h2>
      {withForm && (
        <form action={addExam} className="mb-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_9.5rem_auto]">
          <input name="name" required maxLength={80} className="input col-span-2 sm:col-span-1" placeholder="Exam name, e.g. Maths final" aria-label="Exam name" />
          <input name="examDate" type="date" required className="input" aria-label="Exam date" />
          <button className="btn !px-3" aria-label="Add exam"><Icon name="plus" /></button>
        </form>
      )}
      <ul className="space-y-2">
        {sorted.map((e) => {
          const d = daysLeft(e.examDate);
          const tone = d < 0 ? "bg-soft text-muted" : d <= 7 ? "bg-bad-bg text-bad-fg" : d <= 21 ? "bg-warn-bg text-warn-fg" : "bg-ok-bg text-ok-fg";
          return (
            <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
              <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${tone}`}>
                <span className="text-lg font-bold leading-none">{d < 0 ? "–" : d}</span>
                <span className="text-[10px] uppercase">{d === 1 ? "day" : "days"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.name}</div>
                <div className="text-xs text-muted">
                  {new Date(`${e.examDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  {d === 0 && " · today!"}
                  {d < 0 && " · finished"}
                </div>
              </div>
              {withForm && (
                <form action={deleteExam}>
                  <input type="hidden" name="id" value={e.id} />
                  <button className="rounded p-1 text-muted hover:text-bad-fg" aria-label="Delete exam"><Icon name="trash" className="h-4 w-4" /></button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {exams.length === 0 && <p className="py-3 text-center text-sm text-muted">No exams added. Add one to see the days left.</p>}
    </div>
  );
}
