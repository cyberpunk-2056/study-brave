"use client";

import { useActionState, useState } from "react";
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
  // React clears an uncontrolled form after every submit. Remember what was typed (never passwords) so that a
  // typo in one field does not wipe the whole form.
  const [kept, setKept] = useState<Record<string, string>>({});

  return (
    <form
      action={formAction}
      noValidate={false}
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        const next: Record<string, string> = {};
        for (const f of fields) if (f.type !== "password") next[f.name] = String(data.get(f.name) ?? "");
        setKept(next);
      }}
      className="space-y-4"
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>{f.label}</label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            defaultValue={f.type === "password" ? undefined : kept[f.name]}
            required
            className="input"
            aria-invalid={state?.error ? true : undefined}
          />
        </div>
      ))}
      <div aria-live="polite" className="empty:hidden">
        {state?.error && <p className="alert-error" role="alert">{state.error}</p>}
        {state?.ok && <p className="alert-ok" role="status">{state.ok}</p>}
      </div>
      <button className="btn w-full" disabled={pending}>{pending ? "Please wait…" : submit}</button>
    </form>
  );
}
