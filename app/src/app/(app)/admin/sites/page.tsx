import { addExternalSite, approveSiteRequest, rejectSiteRequest, removeExternalSite } from "@/app/actions/admin";
import { ActionForm } from "@/components/AuthForm";
import { PerStudentSiteForm } from "@/components/PerStudentSiteForm";
import { all, type ExternalSite, type SiteRequest, type User } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export default async function AdminSites() {
  await requireAdmin();
  const sites = await all<ExternalSite>("SELECT * FROM ExternalSite ORDER BY createdAt DESC");
  const students = await all<Pick<User, "id" | "name" | "email">>("SELECT id, name, email FROM AppUser WHERE role = 'STUDENT' ORDER BY name");
  const studentName = new Map(students.map((s) => [s.id, s.name]));
  const pending = await all<SiteRequest>("SELECT * FROM SiteRequest WHERE status = 'PENDING' ORDER BY createdAt");
  const decided = await all<SiteRequest>("SELECT * FROM SiteRequest WHERE status != 'PENDING' ORDER BY decidedAt DESC LIMIT 10");

  return (
    <div className="space-y-5">
      {pending.length > 0 && (
        <div className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Requests from students ({pending.length})</h2>
            <p className="text-sm text-muted">A student asked to open one of these. Approving also adds it to their Course sites.</p>
          </div>
          <ul className="divide-y divide-line">
            {pending.map((r) => (
              <li key={r.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {studentName.get(r.userId) ?? "A removed student"} <span className="font-normal text-muted">wants {r.domain}</span>
                    </p>
                    {r.title !== r.domain && <p className="text-xs text-muted">Calls it &ldquo;{r.title}&rdquo;</p>}
                    {r.reason && <p className="text-xs text-muted">&ldquo;{r.reason}&rdquo;</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={approveSiteRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn">Approve</button>
                    </form>
                    <details className="relative">
                      <summary className="btn-danger cursor-pointer list-none">Reject</summary>
                      <form action={rejectSiteRequest} className="absolute right-0 z-10 mt-2 w-64 space-y-2 rounded-xl border border-line bg-surface p-3 shadow-lg">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="note" className="input !text-xs" placeholder="Reason (optional, shown to student)" maxLength={200} />
                        <button className="btn-danger w-full">Confirm reject</button>
                      </form>
                    </details>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Approve a course website</h2>
          <p className="text-sm text-muted">
            A purchased course site (Udemy, Coursera, Vedantu, your school&apos;s LMS, …) a student can open inside the desktop app.
            It is never a free address bar: only domains approved here can be opened, and the student can&apos;t browse away from them.
          </p>
        </div>
        <ActionForm
          action={addExternalSite}
          submit="Approve"
          fields={[
            { name: "domain", label: "Domain", placeholder: "udemy.com (subdomains are covered automatically)" },
            { name: "title", label: "Name shown to the student", placeholder: "e.g. My Udemy course" },
          ]}
        />
        <details className="rounded-xl bg-soft p-3 text-sm">
          <summary className="cursor-pointer font-medium">Approve for one student instead of everyone</summary>
          <PerStudentSiteForm students={students} />
        </details>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Approved sites ({sites.length})</h2>
        <ul className="divide-y divide-line">
          {sites.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.title} <span className="font-normal text-muted">· {s.domain}</span></p>
                <p className="text-xs text-muted">{s.userId ? `Only for ${studentName.get(s.userId) ?? "a removed student"}` : "Every student"}</p>
              </div>
              <form action={removeExternalSite}>
                <input type="hidden" name="id" value={s.id} />
                <button className="btn-danger">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        {sites.length === 0 && <p className="text-sm text-muted">No course sites approved yet.</p>}
      </div>

      {decided.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">Recent request decisions</summary>
          <ul className="mt-3 divide-y divide-line">
            {decided.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <span className={r.status === "APPROVED" ? "text-ok-fg" : "text-bad-fg"}>{r.status === "APPROVED" ? "Approved" : "Rejected"}</span>{" "}
                {studentName.get(r.userId) ?? "a removed student"}&apos;s request for <b>{r.domain}</b>
                {r.adminNote && <span className="text-muted"> — &ldquo;{r.adminNote}&rdquo;</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
