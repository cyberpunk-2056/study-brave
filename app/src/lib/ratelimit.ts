import { headers } from "next/headers";
import { all, run } from "./db";

// Attempt limits stored in Postgres, so they hold across all serverless instances.
//   isLimited(key, max)        -> is this key already over its limit?  (does not count)
//   recordHit(key, windowMs)   -> count one attempt in a fixed window that starts at the first attempt
//   clearHits(key)             -> forget the counter (e.g. after a successful login)

export type Limited = { limited: false } | { limited: true; retryAfterSec: number };

export async function isLimited(key: string, max: number): Promise<Limited> {
  const rows = await all<{ count: number; resetAt: number }>("SELECT count, resetAt FROM RateLimit WHERE key = ?", key);
  const r = rows[0];
  if (r && r.resetAt > Date.now() && r.count >= max) return { limited: true, retryAfterSec: Math.ceil((r.resetAt - Date.now()) / 1000) };
  return { limited: false };
}

export async function recordHit(key: string, windowMs: number): Promise<number> {
  const now = Date.now();
  const rows = await all<{ count: number }>(
    `INSERT INTO RateLimit (key, count, resetAt) VALUES (?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN RateLimit.resetAt <= ? THEN 1 ELSE RateLimit.count + 1 END,
       resetAt = CASE WHEN RateLimit.resetAt <= ? THEN ? ELSE RateLimit.resetAt END
     RETURNING count`,
    key, now + windowMs, now, now, now + windowMs,
  );
  return rows[0]?.count ?? 1;
}

export const clearHits = (key: string) => run("DELETE FROM RateLimit WHERE key = ?", key);

/** Best guess of the visitor's address. On Vercel the platform sets these headers, so they cannot be forged by the client. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim().slice(0, 64);
}

export const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));

/** Housekeeping: remove counters that expired long ago. Cheap, called occasionally. */
export const pruneRateLimits = () => run("DELETE FROM RateLimit WHERE resetAt < ?", Date.now() - 86400_000);
