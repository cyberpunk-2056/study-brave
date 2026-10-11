"use server";

import { revalidatePath } from "next/cache";
import { newId, run } from "@/lib/db";
import { isLimited, minutes, recordHit } from "@/lib/ratelimit";
import { requireUser } from "@/lib/session";
import type { FormState } from "./auth";

/** A student messages the support team (their admin). Shows up on the admin's Support page, unread. */
export async function sendSupportMessage(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const body = String(form.get("body") ?? "").trim().slice(0, 1000);
  if (!body) return { error: "Write a message first." };

  const key = `support:user:${user.id}`;
  const lim = await isLimited(key, 20);
  if (lim.limited) return { error: `Too many messages. Try again in ${minutes(lim.retryAfterSec)} minutes.` };
  await recordHit(key, 60 * 60_000);

  await run(
    "INSERT INTO Message (id, userId, fromRole, fromName, body, createdAt, read) VALUES (?,?,?,?,?,?,0)",
    newId(), user.id, "STUDENT", user.name, body, Date.now(),
  );
  revalidatePath("/support");
  revalidatePath("/admin/support");
  return { ok: "Sent." };
}
