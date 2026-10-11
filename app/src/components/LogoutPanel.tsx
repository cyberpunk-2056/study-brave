"use client";

import { useActionState, useState } from "react";
import { logout } from "@/app/actions/auth";
import { requestUnlockCode, type LockResult } from "@/app/actions/lock";
import { Icon } from "@/components/Icon";

/** Log out. Students with the study lock on need a code from their parent or admin. */
export function LogoutPanel({ needsCode, hasParentEmail }: { needsCode: boolean; hasParentEmail: boolean }) {
  const [state, formAction, pending] = useActionState(logout, undefined);
  const [code, setCode] = useState("");
  const [req, setReq] = useState<LockResult>();
  const [busy, setBusy] = useState(false);

  if (!needsCode) {
    return (
      <form action={formAction} className="card flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Log out</h2>
          <p className="text-sm text-muted">Sign out of this device.</p>
        </div>
        <button className="btn-ghost" disabled={pending}><Icon name="logout" /> Log out</button>
      </form>
    );
  }

  return (
    <section className="card space-y-3" aria-label="Log out">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔐</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Log out</h2>
          <p className="text-sm text-muted">
            You can only log out with a one-time code from your {hasParentEmail ? "parent or " : ""}admin. Ask for a code — it is emailed to them, not to you.
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setReq(await requestUnlockCode("logout"));
          setBusy(false);
        }}
      >
        Ask my {hasParentEmail ? "parent" : "admin"} for a logout code
      </button>
      <form action={formAction} className="flex flex-wrap gap-2">
        <input
          name="code"
          className="input !w-40 tracking-[0.3em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-label="Logout code"
        />
        <button className="btn" disabled={pending || code.length !== 6}><Icon name="logout" /> {pending ? "Checking…" : "Log out"}</button>
      </form>
      <div aria-live="polite" className="empty:hidden">
        {(state?.error || req?.error) && <p className="alert-error" role="alert">{state?.error ?? req?.error}</p>}
        {!state?.error && req?.ok && <p className="alert-ok" role="status">{req.ok}</p>}
      </div>
    </section>
  );
}
