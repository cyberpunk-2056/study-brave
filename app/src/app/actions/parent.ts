"use server";

import { get, newId, run, userById } from "@/lib/db";
import { userIdFromParentToken } from "@/lib/lock";
import type { FormState } from "./auth";

/** Public action: a parent with their private link leaves a message for the student. */
export async function sendParentMessage(_: FormState, form: FormData): Promise<FormState> {
  const userId = userIdFromParentToken(String(form.get("token") ?? ""));
  const student = userId ? await userById(userId) : undefined;
  if (!student) return { error: "This link is not valid." };
  const body = String(form.get("body") ?? "").trim().slice(0, 500);
  if (!body) return { error: "Please write a message." };
  // Anyone holding the link could send, so keep it from being used to spam the student.
  const recent = (await get<{ n: number }>("SELECT COUNT(*) n FROM Message WHERE userId = ? AND fromRole = 'PARENT' AND createdAt > ?", student.id, Date.now() - 3600_000))?.n ?? 0;
  if (recent >= 5) return { error: "Too many messages in the last hour. Please try again later." };
  await run("INSERT INTO Message (id, userId, fromRole, fromName, body, createdAt) VALUES (?,?,?,?,?,?)", newId(), student.id, "PARENT", "Parent", body, Date.now());
  return { ok: `Sent! ${student.name.split(" ")[0]} will see it in the Focus Study taskbar.` };
}
