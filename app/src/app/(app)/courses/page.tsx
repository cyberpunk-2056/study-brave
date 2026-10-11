import { CourseSiteButton } from "@/components/CourseSiteButton";
import { Icon } from "@/components/Icon";
import { RequestSiteForm } from "@/components/RequestSiteForm";
import { all, get, type ExternalSite, type SiteRequest } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDuration } from "@/lib/stats";

const STATUS_LABEL: Record<SiteRequest["status"], string> = { PENDING: "Waiting on your admin", APPROVED: "Approved", REJECTED: "Not approved" };
const STATUS_CLASS: Record<SiteRequest["status"], string> = {
  PENDING: "bg-soft text-muted",
  APPROVED: "bg-ok-bg text-ok-fg",
  REJECTED: "bg-bad-bg text-bad-fg",
};

export default async function Courses() {
  const user = await requireUser();
  const sites = await all<ExternalSite>(
    "SELECT * FROM ExternalSite WHERE userId = ? OR userId IS NULL ORDER BY title",
    user.id,
  );
  const requests = await all<SiteRequest>("SELECT * FROM SiteRequest WHERE userId = ? ORDER BY createdAt DESC LIMIT 20", user.id);
  const total = (await get<{ n: number }>("SELECT COALESCE(SUM(seconds),0) n FROM StudySession WHERE userId = ? AND kind = 'COURSE'", user.id))?.n ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="page-title">Course sites</h1>
        <p className="text-muted">
          Websites your admin has approved — for a course you&apos;ve purchased elsewhere. In the Focus Study Desktop app these
          open in a locked view: no address bar, and you can&apos;t browse away from the approved site. Time spent there is
          tracked separately from your Pomodoro focus time. In an ordinary browser they just open in a new tab.
        </p>
      </div>

      {total > 0 && (
        <div className="card !p-4">
          <div className="text-sm text-muted">Total course time</div>
          <div className="mt-1 text-2xl font-bold">{fmtDuration(total)}</div>
        </div>
      )}

      <ul className="space-y-3">
        {sites.map((s) => (
          <li key={s.id} className="card flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-soft text-accent"><Icon name="globe" /></span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.title}</p>
                <p className="truncate text-xs text-muted">{s.domain.replace(/^\*\./, "")}</p>
              </div>
            </div>
            <CourseSiteButton domain={s.domain} title={s.title} />
          </li>
        ))}
      </ul>
      {sites.length === 0 && (
        <p className="text-muted">No course sites are approved yet — ask below, or wait for your admin to add one.</p>
      )}

      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Request a new course site</h2>
          <p className="text-sm text-muted">Bought a course somewhere else? Ask your admin to approve the site. They can accept or decline it.</p>
        </div>
        <RequestSiteForm />
      </div>

      {requests.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Your requests</h2>
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{r.title} <span className="font-normal text-muted">· {r.domain}</span></p>
                  <span className={`badge ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>
                {r.reason && <p className="mt-0.5 text-xs text-muted">&ldquo;{r.reason}&rdquo;</p>}
                {r.status === "REJECTED" && r.adminNote && <p className="mt-0.5 text-xs text-bad-fg">Admin: {r.adminNote}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
