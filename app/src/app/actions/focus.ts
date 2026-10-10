"use server";

import { headers } from "next/headers";
import { isDesktopRequest } from "@/lib/desktop";
import { beat, finishRun, startRun, type FinishResult } from "@/lib/focus";
import { logLockOnce } from "@/lib/lock";
import { requireUser } from "@/lib/session";

const fromDesktopApp = async () => isDesktopRequest(await headers());

export async function startFocusRun(subject: string, plannedSec: number): Promise<{ id?: string; error?: string }> {
  const user = await requireUser();
  const strict = user.role === "STUDENT" ? user.strictMode : 0;
  if (strict === 2 && !(await fromDesktopApp())) {
    await logLockOnce(user.id, "APP_REQUIRED", 60_000);
    return { error: "Your admin requires the Focus Study Desktop app for focus sessions." };
  }
  if (!Number.isFinite(plannedSec)) return { error: "Invalid timer length." };
  return { id: (await startRun(user.id, subject, plannedSec, strict >= 1)).id };
}

/** Sent every few seconds while a focus run exists. `running` is whether the timer is currently counting. */
export async function beatFocusRun(id: string, running: boolean) {
  const user = await requireUser();
  return await beat(user.id, id, !!running);
}

export async function finishFocusRun(id: string, mode: "COMPLETE" | "STOP", running: boolean): Promise<FinishResult> {
  const user = await requireUser();
  if (mode !== "COMPLETE" && mode !== "STOP") return { ok: false };
  return await finishRun(user.id, id, mode, !!running);
}
