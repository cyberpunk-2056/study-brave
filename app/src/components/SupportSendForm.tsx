"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/auth";

/** A chat-style send box: textarea + button, clears itself on success. Works for both the student's and the
 *  admin's reply forms — just pass the right action and any hidden fields it needs. */
export function SupportSendForm({
  action, placeholder, hidden,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex gap-2">
        <textarea name="body" required maxLength={1000} rows={2} className="input flex-1 resize-none" placeholder={placeholder} aria-label="Message" />
        <button className="btn self-end" disabled={pending}>{pending ? "Sending…" : "Send"}</button>
      </div>
      {state?.error && <p className="alert-error" role="alert">{state.error}</p>}
    </form>
  );
}
