import { StatsView } from "@/components/StatsView";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { SessionRow } from "@/lib/stats";

export default async function Analytics() {
  const user = await requireUser();
  const sessions = await all<SessionRow>(
    "SELECT kind, subject, seconds, startedAt FROM StudySession WHERE userId = ? AND startedAt > ?",
    user.id,
    Date.now() - 100 * 86400_000,
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Your analytics</h1>
        <p className="text-muted">See how much you study, when, and on what.</p>
      </div>
      <StatsView sessions={sessions} goalMin={user.dailyGoalMin} />
    </div>
  );
}
