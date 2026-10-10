// Creates / updates the database tables. Safe to run as often as you like.
//   npm run db:migrate            (uses DATABASE_URL from .env)
import { closeDb, migrate } from "../src/lib/db";

async function main() {
  await migrate();
  console.log("Database is up to date.");
  await closeDb();
}

main().catch((e) => {
  console.error("Migration failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
