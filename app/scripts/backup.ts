// Saves a copy of every table to backups/<date>.json  (Supabase's free plan has no automatic backups).
//   npm run backup            (uses DATABASE_URL from .env; point it at your Supabase database)
// Keep the file somewhere safe: it contains student data and password hashes.
import { mkdirSync, writeFileSync } from "node:fs";
import { all, closeDb } from "../src/lib/db";
import { TABLES } from "../src/lib/schema";

async function main() {
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) dump[t] = await all(`SELECT * FROM ${t}`);
  mkdirSync("backups", { recursive: true });
  const file = `backups/${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify({ savedAt: new Date().toISOString(), tables: dump }, null, 1));
  console.log(`Saved ${file}:`, TABLES.map((t) => `${t}=${dump[t].length}`).join(", "));
  await closeDb();
}
main().catch((e) => {
  console.error("Backup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
