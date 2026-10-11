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
  if (process.argv.includes("--demo")) {
    // Sample data so every page has something to show: tasks, an exam, ~3 weeks of study, saved + watched videos.
    for (const [i, t] of ["Finish Chapter 4", "Revise formulas", "Practice past paper"].entries())
      await run("INSERT INTO Task (id,userId,title,done,createdAt) VALUES (?,?,?,?,?)", newId(), id, t, i === 2 ? 1 : 0, now - i * 1000);
    await run("INSERT INTO Exam (id,userId,name,examDate) VALUES (?,?,?,?)", newId(), id, "Maths final", new Date(now + 12 * 86400_000).toISOString().slice(0, 10));
    const subjects = ["Physics", "Maths", "Chemistry"];
    for (let d = 0; d < 21; d++) {
      if (d % 4 === 3) continue;
      const at = now - d * 86400_000 - 3 * 3600_000;
      await run("INSERT INTO StudySession (id,userId,kind,subject,seconds,startedAt) VALUES (?,?,?,?,?,?)", newId(), id, "FOCUS", subjects[d % 3], 1200 + ((d * 733) % 3600), at);
      await run("INSERT INTO StudySession (id,userId,kind,subject,seconds,startedAt) VALUES (?,?,?,?,?,?)", newId(), id, "SITTING", "Sitting", 900 + ((d * 311) % 1800), at);
    }
    await run("INSERT INTO Channel (id,userId,ytId,title,thumbnail,uploadsId,createdAt) VALUES (?,NULL,?,?,?,?,?)", newId(), "UC4a-Gbdw7vOaccHmFo40b9g", "Khan Academy", null, "UU4a-Gbdw7vOaccHmFo40b9g", now);
    await run("INSERT INTO SavedVideo (userId,videoId,title,thumbnail,channelTitle,channelId,duration,savedAt) VALUES (?,?,?,?,?,?,?,?)", id, "dQw4w9WgXcQ", "Sample saved lesson", "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg", "Khan Academy", "UC4a-Gbdw7vOaccHmFo40b9g", "12:34", now);
    await run("INSERT INTO WatchHistory (userId,videoId,title,thumbnail,channelTitle,channelId,duration,watchedAt) VALUES (?,?,?,?,?,?,?,?)", id, "dQw4w9WgXcQ", "Sample watched lesson", "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg", "Khan Academy", "UC4a-Gbdw7vOaccHmFo40b9g", "12:34", now - 3600_000);
  }
  if (process.argv.includes("--relaxed")) await run("UPDATE AppUser SET strictMode = 0 WHERE id = ?", id);
  const admin = await get<{ id: string }>("SELECT id FROM AppUser WHERE role = 'ADMIN' ORDER BY createdAt LIMIT 1");
  console.log([id, await sign(id), await sign(admin!.id)].join(" "));
  await closeDb();
}
main();
