"use client";

import { useActionState } from "react";
import { sendParentMessage } from "@/app/actions/parent";

export function ParentMessageForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(sendParentMessage, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <textarea name="body" required maxLength={500} rows={4} className="input" placeholder="Write a short message…" aria-label="Message" />
      {state?.error && <p className="alert-error" role="alert">{state.error}</p>}
      {state?.ok && <p className="alert-ok" role="status">{state.ok}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Sending…" : "Send message"}</button>
    </form>
  );
}
