// Dev helper: prints a login cookie value for a user id (or the first admin).  npx tsx --env-file=.env scripts/make-cookie.ts [userId]
import { SignJWT } from "jose";
import { closeDb, get } from "../src/lib/db";

async function main() {
  const id = process.argv[2] ?? (await get<{ id: string }>("SELECT id FROM AppUser WHERE role = 'ADMIN' ORDER BY createdAt LIMIT 1"))?.id;
  if (!id) throw new Error("no such user");
  console.log(await new SignJWT({ uid: id }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(new TextEncoder().encode(process.env.SESSION_SECRET)));
  await closeDb();
}
main();
