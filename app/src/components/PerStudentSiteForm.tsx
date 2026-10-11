"use client";

import { useActionState } from "react";
import { addExternalSite } from "@/app/actions/admin";

export function PerStudentSiteForm({ students }: { students: { id: string; name: string; email: string }[] }) {
  const [state, formAction, pending] = useActionState(addExternalSite, undefined);
  return (
    <form action={formAction} className="mt-3 space-y-3">
      <select name="studentId" required className="input" aria-label="Student">
        <option value="">Choose a student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
        ))}
      </select>
      <input name="domain" required className="input" placeholder="udemy.com" aria-label="Domain" />
      <input name="title" className="input" placeholder="Name shown to the student" aria-label="Title" />
      <div aria-live="polite" className="empty:hidden">
        {state?.error && <p className="alert-error" role="alert">{state.error}</p>}
        {state?.ok && <p className="alert-ok" role="status">{state.ok}</p>}
      </div>
      <button className="btn" disabled={pending}>{pending ? "Please wait…" : "Approve for this student"}</button>
    </form>
  );
}
