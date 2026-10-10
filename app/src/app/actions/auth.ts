"use server";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { newId, run, transaction, userByEmail, get } from "@/lib/db";
import { esc } from "@/lib/lock";
import { sendMail } from "@/lib/mail";
import { createSession, destroySession } from "@/lib/session";

export type FormState = { error?: string; ok?: string } | undefined;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

const signupSchema = z.object({
  name: z.string().trim().min(2, "Name is too short"),
  email: z.string().trim().toLowerCase().email("Invalid email"),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Invalid phone number"),
  parentEmail: z.string().trim().toLowerCase().email("Invalid parent email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, phone, parentEmail, password } = parsed.data;
  if (parentEmail === email) return { error: "Parent email must be different from your own email" };
  if (await userByEmail(email)) return { error: "Email already registered" };
  const id = newId();
  const now = Date.now();
  await run(
    "INSERT INTO AppUser (id, name, email, phone, parentEmail, passwordHash, lastLoginAt, createdAt) VALUES (?,?,?,?,?,?,?,?)",
    id, name, email, phone, parentEmail, await bcrypt.hash(password, 10), now, now,
  );
  await createSession(id);
  redirect("/dashboard");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await userByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return { error: "Wrong email or password" };
  if (user.disabled) return { error: "This account has been disabled by the admin" };
  await run("UPDATE AppUser SET lastLoginAt = ? WHERE id = ?", Date.now(), user.id);
  await createSession(user.id);
  redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const user = await userByEmail(email);
  if (user && !user.disabled) {
    const token = randomBytes(32).toString("hex");
    await run(
      "INSERT INTO PasswordReset (id, userId, tokenHash, expiresAt) VALUES (?,?,?,?)",
      newId(), user.id, hash(token), Date.now() + 60 * 60 * 1000,
    );
    const link = `${process.env.APP_URL}/reset-password?token=${token}`;
    try {
      await sendMail(
        user.email,
        "Reset your Focus Study password",
        `<p>Hi ${esc(user.name)},</p><p>Click the link below to set a new password. It expires in 1 hour.</p><p><a href="${link}">${link}</a></p><p>If you did not request this, ignore this email.</p>`,
      );
    } catch (e) {
      console.error("SMTP error", e);
      return { error: "Could not send email. Please try again later." };
    }
  }
  // Same message either way so emails can't be probed.
  return { ok: "If that email is registered, a reset link has been sent." };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  const reset = await get<{ id: string; userId: string; expiresAt: number; used: number }>(
    "SELECT * FROM PasswordReset WHERE tokenHash = ?",
    hash(token),
  );
  if (!reset || reset.used || reset.expiresAt < Date.now()) return { error: "This reset link is invalid or expired" };
  const passwordHash = await bcrypt.hash(password, 10);
  await transaction(async (tx) => {
    await tx.run("UPDATE AppUser SET passwordHash = ? WHERE id = ?", passwordHash, reset.userId);
    await tx.run("UPDATE PasswordReset SET used = 1 WHERE id = ?", reset.id);
  });
  redirect("/login?reset=1");
}
