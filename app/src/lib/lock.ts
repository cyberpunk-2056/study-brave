import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { all, get, newId, run, type User } from "./db";
import { sendMail } from "./mail";

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const LOCK_EVENT_KINDS = ["FULLSCREEN_EXIT", "TAB_SWITCH", "RELOAD", "UNLOCKED_WITH_CODE", "CODE_REQUESTED", "CODE_FAILED", "HEARTBEAT_LOST", "APP_REQUIRED", "APP_RESTARTED", "OFFLINE_SYNCED", "OFFLINE_FLAGGED"] as const;
/** Kinds the browser/app may report itself; everything else is written by the server only. */
export const CLIENT_EVENT_KINDS: readonly LockEventKind[] = ["FULLSCREEN_EXIT", "TAB_SWITCH", "RELOAD", "APP_RESTARTED"];
export type LockEventKind = (typeof LOCK_EVENT_KINDS)[number];

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const hashCode = (userId: string, code: string) =>
  createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`${userId}:${code}`).digest("hex");

export async function logLock(userId: string, kind: LockEventKind) {
  await run("INSERT INTO LockEvent (id, userId, kind, at) VALUES (?,?,?,?)", newId(), userId, kind, Date.now());
}

/** Log an event unless the same kind was already logged for this user in the last `withinMs`. */
export async function logLockOnce(userId: string, kind: LockEventKind, withinMs: number) {
  if (!(await get("SELECT 1 AS x FROM LockEvent WHERE userId = ? AND kind = ? AND at > ?", userId, kind, Date.now() - withinMs))) await logLock(userId, kind);
}

/** Creates a fresh 6-digit code (older unused codes stop working) and returns it in plain text once. */
export async function createUnlockCode(userId: string, issuedBy: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await run("UPDATE UnlockCode SET used = 1 WHERE userId = ? AND used = 0", userId);
  await run(
    "INSERT INTO UnlockCode (id, userId, codeHash, expiresAt, issuedBy, createdAt) VALUES (?,?,?,?,?,?)",
    newId(), userId, hashCode(userId, code), Date.now() + CODE_TTL_MS, issuedBy, Date.now(),
  );
  return code;
}

export async function checkUnlockCode(userId: string, code: string): Promise<"ok" | "wrong" | "expired" | "locked"> {
  const row = await get<{ id: string; codeHash: string; expiresAt: number; attempts: number }>(
    "SELECT id, codeHash, expiresAt, attempts FROM UnlockCode WHERE userId = ? AND used = 0 ORDER BY createdAt DESC LIMIT 1",
    userId,
  );
  if (!row || row.expiresAt < Date.now()) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  if (row.codeHash !== hashCode(userId, code.trim())) {
    await run("UPDATE UnlockCode SET attempts = attempts + 1 WHERE id = ?", row.id);
    return row.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "wrong";
  }
  await run("UPDATE UnlockCode SET used = 1 WHERE id = ?", row.id);
  return "ok";
}

/** The code goes ONLY to the parent and the admins, never to the student. */
export async function mailUnlockCode(student: User, code: string, reason: string) {
  const admins = (await all<{ email: string }>("SELECT email FROM AppUser WHERE role = 'ADMIN' AND disabled = 0")).map((a) => a.email);
  const to = [...new Set([student.parentEmail, ...admins].filter((e): e is string => !!e))];
  if (to.length === 0) return 0;
  const html = `<p><b>${esc(student.name)}</b> ${esc(reason)}</p>
<p>Unlock code: <span style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</span></p>
<p>It works once and expires in ${CODE_TTL_MS / 60000} minutes. Only share it with the student if you agree they may stop their study session early.</p>
<p style="color:#666">Want to leave ${esc(student.name)} a message? <a href="${parentMessageUrl(student.id)}">Send a message</a> — it appears in the student's app.</p>`;
  await Promise.all(to.map((addr) => sendMail(addr, `Focus Study unlock code for ${student.name}`, html)));
  return to.length;
}

// ---------- Offline unlock codes ----------
// The desktop app can check these without internet: the code is derived from a per-student secret (cached in the
// app after the last login) and the current 15-minute window. The admin sees the same code in the admin panel.
const WINDOW_MS = 15 * 60 * 1000;

export async function getOfflineSecret(userId: string) {
  const row = await get<{ offlineSecret: string | null }>("SELECT offlineSecret FROM AppUser WHERE id = ?", userId);
  if (row?.offlineSecret) return row.offlineSecret;
  const secret = randomBytes(24).toString("hex");
  // Only set it if still empty, so two simultaneous requests cannot hand out different secrets.
  await run("UPDATE AppUser SET offlineSecret = ? WHERE id = ? AND offlineSecret IS NULL", secret, userId);
  return (await get<{ offlineSecret: string | null }>("SELECT offlineSecret FROM AppUser WHERE id = ?", userId))?.offlineSecret ?? secret;
}

export function offlineCode(secret: string, windowIndex: number) {
  const mac = createHmac("sha256", secret).update(String(windowIndex)).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** Current code (valid for this 15-minute window and the next one). */
export async function currentOfflineCode(userId: string, now = Date.now()) {
  return offlineCode(await getOfflineSecret(userId), Math.floor(now / WINDOW_MS));
}

// ---------- Parent message link ----------
// A parent has no account. They get a private link (in the emails we send them) that lets them leave a short
// message for the student, which shows up in the desktop app's taskbar. The token is userId + an HMAC of it.
const tokenMac = (userId: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "").update("parent-message:" + userId).digest("base64url");

export const parentToken = (userId: string) => `${userId}.${tokenMac(userId)}`;

export function userIdFromParentToken(token: string): string | null {
  const [userId, mac] = token.split(".");
  if (!userId || !mac) return null;
  const want = Buffer.from(tokenMac(userId));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got) ? userId : null;
}

export const parentMessageUrl = (userId: string) => `${process.env.APP_URL ?? ""}/parent/${parentToken(userId)}`;
