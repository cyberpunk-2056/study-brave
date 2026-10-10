// Checks the Postgres data layer (run against the local engine or a throwaway Supabase project):
//   npm run db:local   (in another terminal)   then   npx tsx --env-file=.env scripts/test-db.ts
import assert from "node:assert";
import { all, closeDb, get, migrate, newId, run, transaction, userByEmail, type User } from "../src/lib/db";

async function main() {
  await migrate();
  await migrate(); // idempotent
  console.log("schema created twice without error");

  const id = newId(), now = Date.now();
  await run("INSERT INTO AppUser (id,name,email,phone,passwordHash,createdAt) VALUES (?,?,?,?,?,?)", id, "Test Kid", "kid@example.com", null, "hash", now);

  const u = await userByEmail("kid@example.com");
  assert(u && u.id === id);
  assert.strictEqual(u.createdAt, now, "BIGINT comes back as a number");
  assert.strictEqual(typeof u.createdAt, "number");
  assert.strictEqual(u.dailyGoalMin, 120); // default + camelCase mapping (dailygoalmin -> dailyGoalMin)
  assert.strictEqual(u.strictMode, 1);
  assert.strictEqual(u.parentEmail, null);
  assert.strictEqual(u.role, "STUDENT");
  console.log("camelCase columns + bigint->number + defaults OK");

  await run("INSERT INTO StudySession (id,userId,kind,subject,seconds,startedAt) VALUES (?,?,?,?,?,?)", newId(), id, "FOCUS", "Physics", 1500, now);
  await run("INSERT INTO StudySession (id,userId,kind,subject,seconds,startedAt) VALUES (?,?,?,?,?,?)", newId(), id, "SITTING", "Sitting", 600, now);
  const rep = await get<{ focusSec: number; sitSec: number; weekSec: number; n: number }>(
    `SELECT COALESCE(SUM(CASE WHEN s.kind='FOCUS' THEN s.seconds END),0) AS focusSec,
            COALESCE(SUM(CASE WHEN s.kind='SITTING' THEN s.seconds END),0) AS sitSec,
            COALESCE(SUM(CASE WHEN s.kind='FOCUS' AND s.startedAt > ? THEN s.seconds END),0) AS weekSec, COUNT(*) AS n
     FROM AppUser u LEFT JOIN StudySession s ON s.userId = u.id WHERE u.id = ? GROUP BY u.id`, now - 1000, id);
  assert.deepStrictEqual(rep, { focusSec: 1500, sitSec: 600, weekSec: 1500, n: 2 });
  console.log("aggregates and aliases (focusSec, sitSec, weekSec) return numbers OK");

  const found = await all<{ name: string }>("SELECT name FROM AppUser WHERE name ILIKE ? OR email ILIKE ?", "%KID%", "%KID%");
  assert.strictEqual(found.length, 1);
  await run("INSERT INTO Channel (id,userId,ytId,title,thumbnail,uploadsId,createdAt) VALUES (?,NULL,?,?,?,?,?)", newId(), "UC1", "Global A", null, "UU1", now);
  await run("INSERT INTO Channel (id,userId,ytId,title,thumbnail,uploadsId,createdAt) VALUES (?,?,?,?,?,?,?)", newId(), id, "UC2", "Mine B", null, "UU2", now);
  const order = await all<{ title: string }>("SELECT * FROM Channel WHERE userId = ? OR userId IS NULL ORDER BY userId IS NULL DESC, title", id);
  assert.deepStrictEqual(order.map((c) => c.title), ["Global A", "Mine B"]);
  await assert.rejects(run("INSERT INTO Channel (id,userId,ytId,title,thumbnail,uploadsId,createdAt) VALUES (?,NULL,?,?,?,?,?)", newId(), "UC1", "dup", null, "UU1", now), /duplicate|unique/i);
  console.log("ILIKE search, boolean ORDER BY, unique index on (COALESCE(userId,''), ytId) OK");

  const up = () => run(`INSERT INTO WatchHistory (userId,videoId,title,thumbnail,channelTitle,channelId,duration,watchedAt) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(userId, videoId) DO UPDATE SET watchedAt = excluded.watchedAt`, id, "vid12345678", "T", "th", "C", "UC1", null, now);
  await up();
  await up();
  assert.strictEqual((await all("SELECT * FROM WatchHistory WHERE userId = ?", id)).length, 1);
  console.log("ON CONFLICT upsert OK");

  await run("INSERT INTO Exam (id,userId,name,examDate) VALUES (?,?,?,?)", newId(), id, "Final", "2999-01-01");
  assert.strictEqual((await all("SELECT * FROM Exam WHERE userId = ? AND examDate >= to_char(CURRENT_DATE - 1, 'YYYY-MM-DD')", id)).length, 1);
  const q = await get<{ s: string }>("SELECT '?' AS s FROM AppUser WHERE id = ?", id);
  assert.strictEqual(q?.s, "?"); // a ? inside a string is not a placeholder
  console.log("date filter and '?' inside strings OK");

  await assert.rejects(transaction(async (tx) => {
    await tx.run("UPDATE AppUser SET name = ? WHERE id = ?", "Changed", id);
    await tx.run("INSERT INTO AppUser (id) VALUES (?)", id); // fails -> everything rolls back
  }));
  assert.strictEqual((await get<User>("SELECT * FROM AppUser WHERE id = ?", id))?.name, "Test Kid");
  await transaction(async (tx) => {
    await tx.run("UPDATE AppUser SET name = ? WHERE id = ?", "Committed", id);
  });
  assert.strictEqual((await get<User>("SELECT * FROM AppUser WHERE id = ?", id))?.name, "Committed");
  console.log("transactions: rollback on error, commit on success OK");

  await run("UPDATE AppUser SET phone = ? WHERE id = ?", undefined, id); // undefined -> NULL
  await run("DELETE FROM AppUser WHERE id = ?", id);
  assert.strictEqual((await all("SELECT * FROM StudySession WHERE userId = ?", id)).length, 0);
  assert.strictEqual((await all("SELECT * FROM Channel WHERE userId = ?", id)).length, 0);
  console.log("cascade delete OK");

  const rls = await all<{ relname: string; relrowsecurity: boolean }>("SELECT relname, relrowsecurity FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace");
  const off = rls.filter((r) => !r.relrowsecurity).map((r) => r.relname);
  assert.deepStrictEqual(off, []);
  console.log(`row level security ON for all ${rls.length} tables`);
  await run("DELETE FROM Channel");
  await closeDb();
  console.log("ALL DATABASE CHECKS PASSED");
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await closeDb();
  process.exit(1);
});
