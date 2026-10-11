"use client";

import { useActionState, useEffect, useRef } from "react";
import { requestExternalSite } from "@/app/actions/study";

export function RequestSiteForm() {
  const [state, formAction, pending] = useActionState(requestExternalSite, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label className="label" htmlFor="req-domain">Website domain</label>
        <input id="req-domain" name="domain" required className="input" placeholder="e.g. udemy.com" />
      </div>
      <div>
        <label className="label" htmlFor="req-title">What to call it (optional)</label>
        <input id="req-title" name="title" maxLength={60} className="input" placeholder="e.g. My Python course" />
      </div>
      <div>
        <label className="label" htmlFor="req-reason">Why you need it (optional)</label>
        <input id="req-reason" name="reason" maxLength={200} className="input" placeholder="e.g. Bought this course for exam prep" />
      </div>
      <div aria-live="polite" className="empty:hidden">
        {state?.error && <p className="alert-error" role="alert">{state.error}</p>}
        {state?.ok && <p className="alert-ok" role="status">{state.ok}</p>}
      </div>
      <button className="btn" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>
    </form>
  );
}
