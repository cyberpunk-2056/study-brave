// Checks the anti-cheat timing, unlock codes, offline codes and parent links on the Postgres database:
//   npx tsx --env-file=.env scripts/test-logic.ts
import assert from "node:assert";
import { all, closeDb, get, newId, run } from "../src/lib/db";
import { beat, finishRun, settleRunOffline, startRun } from "../src/lib/focus";
import { checkUnlockCode, createUnlockCode, currentOfflineCode, getOfflineSecret, logLock, offlineCode, parentToken, userIdFromParentToken } from "../src/lib/lock";

const uid = newId();
const T0 = 1_000_000_000_000;
const show = (label: string, v: unknown) => console.log(label.padEnd(60), JSON.stringify(v));
const sessions = () => all<{ seconds: number; subject: string }>("SELECT seconds, subject FROM StudySession WHERE userId = ? ORDER BY startedAt", uid);
const events = async (k: string) => (await get<{ n: number }>("SELECT COUNT(*) n FROM LockEvent WHERE userId = ? AND kind = ?", uid, k))?.n;

async function main() {
  await run("INSERT INTO AppUser (id,name,email,passwordHash,createdAt) VALUES (?,?,?,?,?)", uid, "Logic Kid", `logic-${uid}@example.invalid`, "x", 1);

  // 1. honest run
  let r = await startRun(uid, "Physics", 60, true, T0);
  for (let s = 5; s <= 60; s += 5) await beat(uid, r.id, true, T0 + s * 1000);
  const done = await finishRun(uid, r.id, "COMPLETE", true, T0 + 60_000);
  assert.deepStrictEqual(done, { ok: true, creditedSec: 60 });
  assert.deepStrictEqual((await sessions()).map((s) => s.seconds), [60]);
  show("1. honest run completes, 60 s saved", done);

  // 2. faked completion after 10 s
  r = await startRun(uid, "Maths", 60, true, T0 + 100_000);
  await beat(uid, r.id, true, T0 + 105_000);
  await beat(uid, r.id, true, T0 + 110_000);
  const fake = await finishRun(uid, r.id, "COMPLETE", true, T0 + 110_000);
  assert.strictEqual(fake.ok, false);
  show("2. fake 'complete' after 10 s of 60 s is refused", fake);

  // 3. stopping a locked run needs a freshly verified code
  const noCode = await finishRun(uid, r.id, "STOP", true, T0 + 111_000);
  assert.deepStrictEqual([noCode.ok, (noCode as { error?: string }).error], [false, "locked"]);
  await logLock(uid, "UNLOCKED_WITH_CODE");
  const stopped = await finishRun(uid, r.id, "STOP", true, Date.now());
  assert.strictEqual(stopped.ok, true);
  show("3. STOP refused without code, accepted after the code", { without: noCode.ok, with: stopped.ok });

  // 4. app killed for 5 minutes -> the gap earns nothing
  r = await startRun(uid, "Chem", 600, true, T0 + 200_000);
  await beat(uid, r.id, true, T0 + 205_000);
  const gap = await beat(uid, r.id, true, T0 + 205_000 + 300_000);
  assert.deepStrictEqual(gap, { creditedSec: 5, plannedSec: 600 });
  assert.strictEqual(await events("HEARTBEAT_LOST"), 1);
  show("4. 5-minute silence earns no credit and is logged", gap);

  // 5. paused time earns nothing; another user cannot touch the run
  r = await startRun(uid, "Bio", 600, false, T0 + 900_000);
  await beat(uid, r.id, true, T0 + 905_000);
  await beat(uid, r.id, false, T0 + 915_000);
  assert.deepStrictEqual(await beat(uid, r.id, true, T0 + 916_000), { creditedSec: 6, plannedSec: 600 });
  assert.deepStrictEqual(await finishRun(newId(), r.id, "COMPLETE", true, T0 + 999_000), { ok: false, gone: true });
  show("5. paused time not credited; other users cannot finish my run", "ok");

  // 6. a run started online and finished offline is merged (one session row, no double counting)
  const before = (await sessions()).length;
  r = await startRun(uid, "Merge", 600, true, T0 + 2_000_000);
  await beat(uid, r.id, true, T0 + 2_010_000);
  assert.strictEqual(await settleRunOffline(uid, r.id, 300, T0 + 2_400_000), true);
  const merged = await sessions();
  assert.strictEqual(merged.length, before + 1);
  assert.strictEqual(merged[merged.length - 1].seconds, 300);
  assert.strictEqual(await settleRunOffline(uid, r.id, 300, T0 + 2_500_000), false); // already closed
  show("6. online-start/offline-finish merged into one 300 s session", merged[merged.length - 1]);

  // 7. unlock codes: right code works once, wrong tries are limited, new code replaces old
  const code = await createUnlockCode(uid, "SELF");
  assert.match(code, /^\d{6}$/);
  assert.strictEqual(await checkUnlockCode(uid, code === "000000" ? "111111" : "000000"), "wrong");
  assert.strictEqual(await checkUnlockCode(uid, code), "ok");
  assert.strictEqual(await checkUnlockCode(uid, code), "expired"); // single use
  const c2 = await createUnlockCode(uid, "SELF");
  const bad = c2 === "999999" ? "888888" : "999999";
  const tries: string[] = [];
  for (let i = 0; i < 5; i++) tries.push(await checkUnlockCode(uid, bad));
  assert.deepStrictEqual(tries, ["wrong", "wrong", "wrong", "wrong", "locked"]);
  assert.strictEqual(await checkUnlockCode(uid, c2), "locked");
  const c3 = await createUnlockCode(uid, "SELF");
  const c4 = await createUnlockCode(uid, "ADMIN");
  assert.strictEqual(await checkUnlockCode(uid, c3), "wrong"); // older code was replaced
  assert.strictEqual(await checkUnlockCode(uid, c4), "ok");
  show("7. codes: single use, 5 tries then locked, newest code wins", tries.join(","));

  // 8. offline code: stable secret, changes per 15-minute window, same formula the app uses
  const secret = await getOfflineSecret(uid);
  assert.strictEqual(await getOfflineSecret(uid), secret);
  const w = Math.floor(Date.now() / 900_000);
  assert.strictEqual(await currentOfflineCode(uid), offlineCode(secret, w));
  assert.notStrictEqual(offlineCode(secret, w), offlineCode(secret, w + 1));
  assert.match(offlineCode(secret, w), /^\d{6}$/);
  show("8. offline code is stable within a window, differs next window", { secretLength: secret.length });

  // 9. parent link token
  const tok = parentToken(uid);
  assert.strictEqual(userIdFromParentToken(tok), uid);
  assert.strictEqual(userIdFromParentToken(tok.slice(0, -2) + "xx"), null);
  assert.strictEqual(userIdFromParentToken("garbage"), null);
  assert.strictEqual(userIdFromParentToken(newId() + "." + tok.split(".")[1]), null); // another user's id with this mac
  show("9. parent token: valid accepted; tampered / garbage / swapped refused", "ok");

  await run("DELETE FROM AppUser WHERE id = ?", uid);
  await closeDb();
  console.log("ALL LOGIC CHECKS PASSED");
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await run("DELETE FROM AppUser WHERE id = ?", uid).catch(() => {});
  await closeDb();
  process.exit(1);
});
