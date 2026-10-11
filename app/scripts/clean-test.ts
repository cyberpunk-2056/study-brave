// Removes everything the self-tests created (users with an @example.invalid address, the test announcement).
import { all, closeDb, run } from "../src/lib/db";

async function main() {
  const users = await all<{ id: string }>("SELECT id FROM AppUser WHERE email LIKE '%@example.invalid' AND role = 'STUDENT'");
  for (const u of users) await run("DELETE FROM AppUser WHERE id = ?", u.id); // cascades to sessions, tasks, messages, ...
  await run("DELETE FROM Announcement WHERE id = 'selftest-ann'");
  await run("DELETE FROM Channel WHERE userId IS NULL AND ytId = 'UC4a-Gbdw7vOaccHmFo40b9g'"); // sample approved channel
  await run("DELETE FROM RateLimit"); // attempt counters created by tests
  console.log(`removed ${users.length} test user(s)`);
  await closeDb();
}
main();
