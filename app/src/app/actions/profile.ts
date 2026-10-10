"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/db";
import { requireUser } from "@/lib/session";
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
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "Current password is wrong" };
  if (next.length < 8) return { error: "New password must be at least 8 characters" };
  await run("UPDATE AppUser SET passwordHash = ? WHERE id = ?", await bcrypt.hash(next, 10), user.id);
  return { ok: "Password changed" };
}
