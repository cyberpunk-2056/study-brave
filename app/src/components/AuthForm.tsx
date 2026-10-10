"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";

export type Field = { name: string; label: string; type?: string; autoComplete?: string; placeholder?: string };

export function ActionForm({
  action,
  fields,
  submit,
  hidden,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>{f.label}</label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} placeholder={f.placeholder} required className="input" />
        </div>
      ))}
      {state?.error && <p className="alert-error" role="alert">{state.error}</p>}
      {state?.ok && <p className="alert-ok" role="status">{state.ok}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Please wait…" : submit}</button>
    </form>
  );
}
