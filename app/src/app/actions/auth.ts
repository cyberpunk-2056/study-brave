"use server";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { newId, run, transaction, userByEmail, get } from "@/lib/db";
import { checkUnlockCode, esc, logLock } from "@/lib/lock";
import { sendMail } from "@/lib/mail";
import { clearHits, clientIp, isLimited, minutes, pruneRateLimits, recordHit } from "@/lib/ratelimit";
import { createSession, destroySession, getUser } from "@/lib/session";

export type FormState = { error?: string; ok?: string } | undefined;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

// Compared against when the email is unknown, so "no such account" takes as long as "wrong password".
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const LOGIN_WINDOW = 15 * 60_000;
const LOGIN_MAX_PER_EMAIL = 5;
const LOGIN_MAX_PER_IP = 25;

const signupSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Invalid email").max(120),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Invalid phone number"),
  parentEmail: z.string().trim().toLowerCase().email("Invalid parent email").max(120),
  // bcrypt only uses the first 72 bytes, so longer passwords add nothing
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long (max 72 characters)"),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, phone, parentEmail, password } = parsed.data;
  if (parentEmail === email) return { error: "Parent email must be different from your own email" };

  // At most 10 sign-ups per hour from one address (stops bulk fake accounts).
  const ipKey = `signup:ip:${await clientIp()}`;
  const lim = await isLimited(ipKey, 10);
  if (lim.limited) return { error: `Too many sign-ups from this network. Try again in ${minutes(lim.retryAfterSec)} minutes.` };

  if (await userByEmail(email)) return { error: "Email already registered" };
  await recordHit(ipKey, 3600_000);
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
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 120);
  const password = String(form.get("password") ?? "").slice(0, 200);

  // Attempt limits: 5 wrong passwords per account and 25 per network in 15 minutes.
  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${await clientIp()}`;
  const [byEmail, byIp] = await Promise.all([isLimited(emailKey, LOGIN_MAX_PER_EMAIL), isLimited(ipKey, LOGIN_MAX_PER_IP)]);
  const blocked = byEmail.limited ? byEmail : byIp.limited ? byIp : null;
  if (blocked && blocked.limited) return { error: `Too many attempts. Please try again in ${minutes(blocked.retryAfterSec)} minutes.` };

  const user = await userByEmail(email);
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    await Promise.all([recordHit(emailKey, LOGIN_WINDOW), recordHit(ipKey, LOGIN_WINDOW)]);
    return { error: "Wrong email or password" };
  }
  if (user.disabled) return { error: "This account has been disabled by the admin" };

  await clearHits(emailKey);
  await run("UPDATE AppUser SET lastLoginAt = ? WHERE id = ?", Date.now(), user.id);
  await createSession(user.id);
  if (Math.random() < 0.05) void pruneRateLimits().catch(() => {}); // occasional cleanup
  redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
}

/** Students with the study lock on can only log out with a code from their parent or admin (checked here, not just in the UI). */
export async function logout(_: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "STUDENT" && user.strictMode > 0) {
    const code = String(form.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit logout code from your parent or admin." };
    const limitKey = `logout:user:${user.id}`;
    const lim = await isLimited(limitKey, 10);
    if (lim.limited) return { error: "Too many tries. Please wait and ask for a new code." };
    const result = await checkUnlockCode(user.id, code);
    if (result !== "ok") {
      await recordHit(limitKey, minutes(15));
      await logLock(user.id, "CODE_FAILED");
      if (result === "wrong") return { error: "Wrong code." };
      if (result === "locked") return { error: "Too many wrong tries on this code. Request a new one." };
      return { error: "No valid code. Request a new one." };
    }
    await logLock(user.id, "LOGOUT_WITH_CODE");
  }
  await destroySession();
  redirect("/login");
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 120);
  const generic: FormState = { ok: "If that email is registered, a reset link has been sent." };

  // 3 requests per hour per address and 10 per network. Over the limit we still answer the same, so nothing is revealed.
  const emailKey = `forgot:email:${email}`;
  const ipKey = `forgot:ip:${await clientIp()}`;
  const [byEmail, byIp] = await Promise.all([isLimited(emailKey, 3), isLimited(ipKey, 10)]);
  if (byEmail.limited || byIp.limited) return generic;
  await Promise.all([recordHit(emailKey, 3600_000), recordHit(ipKey, 3600_000)]);

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
  return generic;
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "").slice(0, 200);
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password.length > 72) return { error: "Password is too long (max 72 characters)" };

  const ipKey = `reset:ip:${await clientIp()}`;
  const lim = await isLimited(ipKey, 20);
  if (lim.limited) return { error: `Too many attempts. Please try again in ${minutes(lim.retryAfterSec)} minutes.` };

  const reset = await get<{ id: string; userId: string; expiresAt: number; used: number }>(
    "SELECT * FROM PasswordReset WHERE tokenHash = ?",
    hash(token),
  );
  if (!reset || reset.used || reset.expiresAt < Date.now()) {
    await recordHit(ipKey, 3600_000);
    return { error: "This reset link is invalid or expired" };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await transaction(async (tx) => {
    // passwordChangedAt cancels every login that was issued before now (e.g. on a stolen laptop).
    await tx.run("UPDATE AppUser SET passwordHash = ?, passwordChangedAt = ? WHERE id = ?", passwordHash, Date.now(), reset.userId);
    await tx.run("UPDATE PasswordReset SET used = 1 WHERE userId = ?", reset.userId); // this link and any other open ones
  });
  redirect("/login?reset=1");
}
