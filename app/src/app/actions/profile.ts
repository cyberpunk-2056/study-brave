"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/db";
import { clearHits, isLimited, minutes, recordHit } from "@/lib/ratelimit";
import { createSession, requireUser } from "@/lib/session";
import type { FormState } from "./auth";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Invalid phone number"),
});

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await run("UPDATE AppUser SET name = ?, phone = ? WHERE id = ?", parsed.data.name, parsed.data.phone, user.id);
  revalidatePath("/", "layout");
  return { ok: "Profile updated" };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "").slice(0, 200);
  const next = String(form.get("next") ?? "");

  // Someone at an unlocked laptop must not be able to guess the current password.
  const key = `chpw:user:${user.id}`;
  const lim = await isLimited(key, 5);
  if (lim.limited) return { error: `Too many attempts. Try again in ${minutes(lim.retryAfterSec)} minutes.` };
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    await recordHit(key, 15 * 60_000);
    return { error: "Current password is wrong" };
  }
  if (next.length < 8) return { error: "New password must be at least 8 characters" };
  if (next.length > 72) return { error: "New password is too long (max 72 characters)" };

  await run("UPDATE AppUser SET passwordHash = ?, passwordChangedAt = ? WHERE id = ?", await bcrypt.hash(next, 10), Date.now(), user.id);
  await clearHits(key);
  await createSession(user.id); // every OTHER login is now invalid; this device gets a fresh one
  return { ok: "Password changed. You were signed out on other devices." };
}
