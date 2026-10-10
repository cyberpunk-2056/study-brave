"use server";

import { get } from "@/lib/db";
import { CLIENT_EVENT_KINDS, checkUnlockCode, createUnlockCode, logLock, mailUnlockCode, MAX_ATTEMPTS, type LockEventKind } from "@/lib/lock";
import { requireUser } from "@/lib/session";

export type LockResult = { ok?: string; error?: string; unlocked?: boolean };

/** Browser reports a violation (left full-screen, switched tab, reloaded). */
export async function reportLockEvent(kind: LockEventKind) {
  const user = await requireUser();
  if (!CLIENT_EVENT_KINDS.includes(kind)) return; // only a few kinds may be self-reported
  // Ignore duplicates fired within 3 seconds (one real exit can raise several events).
  const recent = await get("SELECT 1 FROM LockEvent WHERE userId = ? AND kind = ? AND at > ?", user.id, kind, Date.now() - 3000);
  if (!recent) await logLock(user.id, kind);
}

/** Student asks for a code. It is emailed to the parent and the admins — never returned to the browser. */
export async function requestUnlockCode(): Promise<LockResult> {
  const user = await requireUser();
  const lastHour = (await get<{ n: number }>(
    "SELECT COUNT(*) n FROM UnlockCode WHERE userId = ? AND issuedBy = 'SELF' AND createdAt > ?",
    user.id, Date.now() - 3600_000,
  ))?.n ?? 0;
  if (lastHour >= 3) return { error: "Too many requests. Please wait before asking again." };

  const code = await createUnlockCode(user.id, "SELF");
  await logLock(user.id, "CODE_REQUESTED");
  try {
    const sent = await mailUnlockCode(user, code, "is asking to stop a study session early.");
    if (sent === 0) return { error: "No parent or admin email is set up. Ask your admin to add one." };
    return { ok: user.parentEmail ? "Code sent to your parent and the admin. Ask them for it." : "Code sent to the admin. Ask them for it." };
  } catch (e) {
    console.error("SMTP error", e);
    return { error: "Could not send the email. Please tell your admin." };
  }
}

export async function verifyUnlockCode(code: string): Promise<LockResult> {
  const user = await requireUser();
  if (!/^\d{6}$/.test(code.trim())) return { error: "Enter the 6-digit code." };
  const result = await checkUnlockCode(user.id, code);
  if (result === "ok") {
    await logLock(user.id, "UNLOCKED_WITH_CODE");
    return { unlocked: true, ok: "Unlocked." };
  }
  await logLock(user.id, "CODE_FAILED");
  if (result === "wrong") return { error: "Wrong code." };
  if (result === "locked") return { error: `Too many wrong tries (max ${MAX_ATTEMPTS}). Request a new code.` };
  return { error: "No valid code. Request a new one." };
}
