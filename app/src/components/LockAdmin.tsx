"use client";

import { useActionState } from "react";
import { generateUnlockCode, sendMessage, setParentEmail } from "@/app/actions/admin";

export function ParentEmailForm({ id, current }: { id: string; current: string }) {
  const [state, action, pending] = useActionState(setParentEmail, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="label" htmlFor="parentEmail">Parent / guardian email</label>
      <div className="flex gap-2">
        <input id="parentEmail" name="parentEmail" type="email" defaultValue={current} className="input" placeholder="parent@example.com" />
        <button className="btn-ghost whitespace-nowrap" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
      {state?.error && <p className="alert-error">{state.error}</p>}
      {state?.ok && <p className="alert-ok">{state.ok}</p>}
    </form>
  );
}

export function GenerateCodeForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(generateUnlockCode, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <button className="btn-ghost" disabled={pending}>{pending ? "Generating…" : "Generate unlock code"}</button>
      {state?.error && <p className="alert-error">{state.error}</p>}
      {state?.ok && <p className="alert-ok font-mono text-base font-bold tracking-wider">{state.ok}</p>}
      <p className="text-xs text-muted">The code is also emailed to the parent. Share it with the student only if you agree they may stop early.</p>
    </form>
  );
}

export function SendMessageForm({ id, parentLink }: { id: string; parentLink: string }) {
  const [state, action, pending] = useActionState(sendMessage, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="label" htmlFor="msgbody">Send a message to this student</label>
      <textarea id="msgbody" name="body" required maxLength={500} rows={3} className="input" placeholder="e.g. Dinner is at 8. Finish Chapter 3 first." />
      <button className="btn" disabled={pending}>{pending ? "Sending…" : "Send message"}</button>
      {state?.error && <p className="alert-error">{state.error}</p>}
      {state?.ok && <p className="alert-ok">{state.ok}</p>}
      <p className="break-all text-xs text-muted">
        Parent message link (also in the emails we send the parent): <span className="select-all font-mono">{parentLink}</span>
      </p>
    </form>
  );
}
