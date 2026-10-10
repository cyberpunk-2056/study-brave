// Creates the first admin account (or promotes an existing one).
//   npm run seed        (uses ADMIN_EMAIL / ADMIN_PASSWORD from .env)
import bcrypt from "bcryptjs";
import { closeDb, newId, run, userByEmail } from "../src/lib/db";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  // No built-in default: a forgotten setting must never create an admin with a guessable password.
  if (!email || password.length < 10) throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 10 characters in .env first.");
  if (await userByEmail(email)) {
    await run("UPDATE AppUser SET role = 'ADMIN' WHERE email = ?", email);
  } else {
    await run(
      "INSERT INTO AppUser (id, name, email, passwordHash, role, createdAt) VALUES (?,?,?,?,?,?)",
      newId(), "Admin", email, await bcrypt.hash(password, 10), "ADMIN", Date.now(),
    );
  }
  console.log(`Admin ready: ${email}`);
  await closeDb();
}

main().catch((e) => {
  console.error("Seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
