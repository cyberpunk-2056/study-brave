// A local Postgres for development and tests (PGlite = real Postgres compiled to WebAssembly). No installation needed.
//   npm run db:local         then set  DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/postgres"
// Data is kept in ./data/pglite between runs. Production uses Supabase instead.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dir = process.env.PGLITE_DIR ?? "./data/pglite";
const port = Number(process.env.PGLITE_PORT ?? 5433);

async function main() {
  const db = await PGlite.create(dir);
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();
  console.log(`Local Postgres ready on postgres://postgres:postgres@127.0.0.1:${port}/postgres  (data: ${dir})`);
  const stop = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main();
