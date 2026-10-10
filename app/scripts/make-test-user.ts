// Dev helper for the desktop self-tests: creates a throw-away student (optionally with messages) and prints
//   <userId> <student cookie> <admin cookie>
//   npx tsx --env-file=.env scripts/make-test-user.ts [--messages]
// Remove everything it created with:  npx tsx --env-file=.env scripts/clean-test.ts
import { SignJWT } from "jose";
import { closeDb, get, newId, run } from "../src/lib/db";

const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const sign = (uid: string) => new SignJWT({ uid }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("40m").sign(key);

async function main() {
  const id = newId();
  const now = Date.now();
  await run("INSERT INTO AppUser (id,name,email,passwordHash,createdAt) VALUES (?,?,?,?,?)", id, "Selftest Student", `selftest-${id}@example.invalid`, "x", now);
  if (process.argv.includes("--messages")) {
    const msg = (role: string, from: string, body: string, ago: number) =>
      run("INSERT INTO Message (id,userId,fromRole,fromName,body,createdAt) VALUES (?,?,?,?,?,?)", newId(), id, role, from, body, now - ago);
    await msg("ADMIN", "Admin", "Dinner is at 8. Please finish Chapter 3 first.", 600_000);
    await msg("PARENT", "Parent", "Proud of you! Remember to take a break and drink water.", 120_000);
    await run("INSERT INTO Announcement (id,message,createdAt) VALUES (?,?,?)", "selftest-ann", "Mock test on Saturday at 10 AM.", now - 3_600_000);
  }
  const admin = await get<{ id: string }>("SELECT id FROM AppUser WHERE role = 'ADMIN' ORDER BY createdAt LIMIT 1");
  console.log([id, await sign(id), await sign(admin!.id)].join(" "));
  await closeDb();
}
main();
