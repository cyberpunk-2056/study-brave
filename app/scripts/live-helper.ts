// Helper for testing a DEPLOYED site (dev tool). DATABASE_URL must point at the database the site uses.
//   npx tsx --env-file=.env scripts/live-helper.ts make-admin            -> prints "<email> <password>" of a TEMPORARY admin
//   npx tsx --env-file=.env scripts/live-helper.ts reset-token <email>   -> prints a one-time password-reset token (no email sent)
//   npx tsx --env-file=.env scripts/live-helper.ts rows <email>          -> prints what the database holds for that student
//   npx tsx --env-file=.env scripts/live-helper.ts cleanup               -> removes every livecheck-* test account and test announcement
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { all, closeDb, get, newId, run } from "../src/lib/db";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "make-admin") {
    const email = `livecheck-admin-${Date.now()}@example.invalid`;
    const password = randomBytes(12).toString("base64url") + "9a";
    await run("INSERT INTO AppUser (id,name,email,passwordHash,role,createdAt) VALUES (?,?,?,?,?,?)", newId(), "Livecheck Admin", email, await bcrypt.hash(password, 10), "ADMIN", Date.now());
    console.log(`${email} ${password}`);
  } else if (cmd === "reset-token") {
    const u = await get<{ id: string }>("SELECT id FROM AppUser WHERE email = ?", String(arg).toLowerCase());
    if (!u) throw new Error("no such user");
    const token = randomBytes(32).toString("hex");
    await run("INSERT INTO PasswordReset (id,userId,tokenHash,expiresAt) VALUES (?,?,?,?)", newId(), u.id, createHash("sha256").update(token).digest("hex"), Date.now() + 3600_000);
    console.log(token);
  } else if (cmd === "rows") {
    const u = await get<{ id: string; name: string; phone: string | null; parentEmail: string | null; strictMode: number; disabled: number }>("SELECT * FROM AppUser WHERE email = ?", String(arg).toLowerCase());
    if (!u) throw new Error("no such user");
    const sessions = await all<{ kind: string; subject: string; seconds: number }>("SELECT kind, subject, seconds FROM StudySession WHERE userId = ? ORDER BY startedAt", u.id);
    const tasks = await all<{ title: string; done: number }>("SELECT title, done FROM Task WHERE userId = ? ORDER BY createdAt", u.id);
    const exams = await all<{ name: string }>("SELECT name FROM Exam WHERE userId = ?", u.id);
    const events = await all<{ kind: string; n: number }>("SELECT kind, COUNT(*) n FROM LockEvent WHERE userId = ? GROUP BY kind ORDER BY kind", u.id);
    const msgs = await all<{ fromRole: string; body: string }>("SELECT fromRole, body FROM Message WHERE userId = ?", u.id);
    console.log(JSON.stringify({ name: u.name, phone: u.phone, parentEmail: !!u.parentEmail, strictMode: u.strictMode, disabled: u.disabled, sessions, tasks: tasks.map((t) => `${t.title}${t.done ? " (done)" : ""}`), exams: exams.map((e) => e.name), events: events.map((e) => `${e.kind}x${e.n}`), messages: msgs.map((m) => `${m.fromRole}: ${m.body}`) }));
  } else if (cmd === "cleanup") {
    const users = await all<{ id: string }>("SELECT id FROM AppUser WHERE email LIKE 'livecheck-%@example.invalid' OR email LIKE 'live-%@example.invalid'");
    for (const u of users) await run("DELETE FROM AppUser WHERE id = ?", u.id);
    await run("DELETE FROM Announcement WHERE message LIKE 'LIVECHECK%'");
    console.log(`removed ${users.length} test account(s)`);
  } else {
    throw new Error("unknown command");
  }
  await closeDb();
}
main().catch(async (e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
