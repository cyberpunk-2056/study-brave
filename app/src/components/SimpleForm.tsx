"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";
import type { Field } from "./AuthForm";

export function SimpleForm({
  action,
  fields,
  submit,
  defaults,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  defaults?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>{f.label}</label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} defaultValue={defaults?.[f.name]} required className="input" />
        </div>
      ))}
      {state?.error && <p className="alert-error" role="alert">{state.error}</p>}
      {state?.ok && <p className="alert-ok" role="status">{state.ok}</p>}
      <button className="btn" disabled={pending}>{pending ? "Saving…" : submit}</button>
    </form>
  );
}
