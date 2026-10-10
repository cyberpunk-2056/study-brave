import { ExamsCard, TasksCard } from "@/components/Planner";
import { all, type Exam, type Task } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function Planner() {
  const user = await requireUser();
  const tasks = await all<Task>("SELECT * FROM Task WHERE userId = ? ORDER BY done, createdAt DESC", user.id);
  const exams = await all<Exam>("SELECT * FROM Exam WHERE userId = ? ORDER BY examDate", user.id);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Planner</h1>
        <p className="text-muted">Plan your tasks and keep an eye on your exam dates.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TasksCard tasks={tasks} />
        <ExamsCard exams={exams} />
      </div>
    </div>
  );
}
