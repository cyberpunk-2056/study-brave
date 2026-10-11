// Checks the security features against a RUNNING production server:
//   BASE=http://localhost:3100 npx tsx --env-file=.env scripts/test-security.ts
import assert from "node:assert";
import { SignJWT } from "jose";
import { closeDb, newId, run } from "../src/lib/db";
import { clearHits, isLimited, recordHit } from "../src/lib/ratelimit";

const BASE = process.env.BASE ?? "http://localhost:3100";
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const cookie = (uid: string, issuedAtSec: number) => new SignJWT({ uid }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(issuedAtSec).setExpirationTime("1h").sign(key);
// The local test DB is single-connection: release ours before the server reads, and wait for the server to let go afterwards.
const status = async (path: string, c?: string) => {
  await closeDb();
  const code = (await fetch(BASE + path, { redirect: "manual", headers: c ? { cookie: `fs_session=${c}` } : {} })).status;
  await new Promise((r) => setTimeout(r, 22_000));
  return code;
};
const show = (label: string, v: unknown) => console.log(label.padEnd(66), JSON.stringify(v));

async function main() {
  // ---------- 1. security headers ----------
  const res = await fetch(BASE + "/login");
  const h = (n: string) => res.headers.get(n);
  assert.strictEqual(h("x-frame-options"), "DENY");
  assert.strictEqual(h("x-content-type-options"), "nosniff");
  assert.strictEqual(h("referrer-policy"), "strict-origin-when-cross-origin");
  assert(h("permissions-policy")?.includes("camera=()"));
  assert.strictEqual(h("x-powered-by"), null);
  const csp = h("content-security-policy") ?? "";
  for (const part of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "https://www.youtube-nocookie.com"]) assert(csp.includes(part), `CSP missing ${part}`);
  show("1. security headers (frame, nosniff, referrer, permissions, CSP, no x-powered-by)", "ok");

  // ---------- 2. attempt counter ----------
  const k = `test:${newId()}`;
  assert.deepStrictEqual(await isLimited(k, 3), { limited: false });
  for (let i = 0; i < 3; i++) await recordHit(k, 60_000);
  const lim = await isLimited(k, 3);
  assert(lim.limited && lim.retryAfterSec > 0 && lim.retryAfterSec <= 60);
  await clearHits(k);
  assert.deepStrictEqual(await isLimited(k, 3), { limited: false });
  const k2 = `test:${newId()}`;
  await recordHit(k2, 1); // 1 ms window: expires immediately
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(await recordHit(k2, 60_000), 1); // a new window starts, the old count is forgotten
  await clearHits(k2);
  show("2. attempt counter: blocks at the limit, clears, expires and restarts", "ok");

  // ---------- 3. a password change signs out older logins ----------
  const id = newId();
  const now = Date.now();
  await run("INSERT INTO AppUser (id,name,email,passwordHash,createdAt) VALUES (?,?,?,?,?)", id, "Sec Kid", `selftest-sec-${id}@example.invalid`, "x", now);
  const old = await cookie(id, Math.floor(now / 1000) - 120); // issued two minutes ago
  assert.strictEqual(await status("/dashboard", old), 200);
  await run("UPDATE AppUser SET passwordChangedAt = ? WHERE id = ?", now - 30_000, id); // password changed 30 s ago (after the login)
  const oldStatus = await status("/dashboard", old);
  const fresh = await cookie(id, Math.floor(Date.now() / 1000));
  const freshStatus = await status("/dashboard", fresh);
  assert.strictEqual(oldStatus, 307, "old login must be rejected");
  assert.strictEqual(freshStatus, 200, "new login must work");
  show("3. login issued BEFORE a password change is rejected, a new one works", { old: oldStatus, fresh: freshStatus });

  // ---------- 4. other protections ----------
  const noIat = await new SignJWT({ uid: id }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key); // pre-upgrade style token
  assert.strictEqual(await status("/dashboard", noIat), 307, "tokens without a timestamp are refused once a password was changed");
  await run("UPDATE AppUser SET disabled = 1 WHERE id = ?", id);
  assert.strictEqual(await status("/dashboard", fresh), 307, "disabled accounts are signed out immediately");
  show("4. old-style tokens refused after a password change; disabling an account signs it out at once", "ok");

  await run("DELETE FROM AppUser WHERE id = ?", id);
  await closeDb();
  console.log("ALL SECURITY CHECKS PASSED");
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await closeDb();
  process.exit(1);
});
