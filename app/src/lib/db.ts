import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { SCHEMA } from "./schema";

// Postgres (Supabase). The helpers keep the same shape the rest of the app was written against, but are async:
//   await all<T>(sql, ...params)   -> rows
//   await get<T>(sql, ...params)   -> first row or undefined
//   await run(sql, ...params)      -> executes
// SQL uses "?" placeholders (converted to $1, $2, ... here) and camelCase column names (see CAMEL below).

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  role: "STUDENT" | "ADMIN";
  disabled: number;
  dailyGoalMin: number;
  lastLoginAt: number | null;
  createdAt: number;
  strictMode: number; // 0 off, 1 timer locks the screen, 2 the desktop app is required (students only)
  parentEmail: string | null;
  offlineSecret: string | null; // used to check unlock codes without internet
};

export type Channel = {
  id: string;
  userId: string | null; // null = approved by admin for every student
  ytId: string;
  title: string;
  thumbnail: string | null;
  uploadsId: string;
  createdAt: number;
};

export type StudySession = {
  id: string;
  userId: string;
  kind: "FOCUS" | "BREAK" | "SITTING";
  subject: string;
  seconds: number;
  startedAt: number;
};

export type Task = { id: string; userId: string; title: string; done: number; createdAt: number };
export type Exam = { id: string; userId: string; name: string; examDate: string };
export type OfflineSyncRow = { clientId: string; userId: string; claimedSec: number; creditedSec: number; flagged: number; reason: string | null; startedAt: number; syncedAt: number };
export type Message = { id: string; userId: string; fromRole: "ADMIN" | "PARENT"; fromName: string; body: string; createdAt: number };
export type LockEvent = { id: string; userId: string; kind: string; at: number };
export type Announcement = { id: string; message: string; createdAt: number };
export type SavedVideo = {
  videoId: string; title: string; thumbnail: string; channelTitle: string; channelId: string;
  duration: string | null; savedAt: number;
};
export type HistoryVideo = Omit<SavedVideo, "savedAt"> & { watchedAt: number };

// Postgres folds unquoted names to lower case ("createdAt" -> "createdat"). Map result columns back to camelCase.
const CAMEL = new Map<string, string>();
for (const m of SCHEMA.matchAll(/\b([a-z]+(?:[A-Z][a-z0-9]*)+)\b/g)) CAMEL.set(m[1].toLowerCase(), m[1]);
for (const alias of ["focusSec", "sitSec", "weekSec"]) CAMEL.set(alias.toLowerCase(), alias); // aliases used in reports

type Param = string | number | boolean | null | undefined;
type Client = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __pg?: Client };

function client(): Client {
  if (g.__pg) return g.__pg;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Supabase connection string (see DEPLOY.md).");
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  g.__pg = postgres(url, {
    ssl: local || process.env.DATABASE_SSL === "disable" ? false : "require",
    max: Number(process.env.DATABASE_POOL_MAX) || (process.env.VERCEL ? 1 : 5), // serverless: one connection per instance, the Supabase pooler does the rest
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {}, // "already exists, skipping" notices are expected when re-running the migration
    prepare: false, // required for Supabase's transaction pooler (port 6543)
    types: { bigint: { to: 20, from: [20], parse: (x: string) => Number(x), serialize: (x: unknown) => String(x) } },
    transform: { column: { from: (name: string) => CAMEL.get(name) ?? name } },
  });
  return g.__pg;
}

/** "?" placeholders -> $1, $2, ... (skips anything inside single quotes). */
function toPg(sql: string) {
  let n = 0;
  let inStr = false;
  let out = "";
  for (const ch of sql) {
    if (ch === "'") inStr = !inStr;
    out += ch === "?" && !inStr ? `$${++n}` : ch;
  }
  return out;
}
const norm = (params: Param[]) => params.map((p) => (p === undefined ? null : p)) as never[];

export const newId = () => randomUUID();

export async function all<T>(sql: string, ...params: Param[]): Promise<T[]> {
  const rows = await client().unsafe(toPg(sql), norm(params));
  return rows.map((r) => ({ ...r })) as T[]; // plain objects, safe to pass to Client Components
}

export async function get<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await all<T>(sql, ...params))[0];
}

export async function run(sql: string, ...params: Param[]): Promise<void> {
  await client().unsafe(toPg(sql), norm(params));
}

export type Tx = { run: (sql: string, ...params: Param[]) => Promise<void> };

/** All-or-nothing group of statements. */
export async function transaction(fn: (tx: Tx) => Promise<void>): Promise<void> {
  await client().begin(async (sql) => {
    await fn({ run: async (q, ...p) => void (await sql.unsafe(toPg(q), norm(p))) });
  });
}

/** Creates/updates the tables (safe to run repeatedly). Used by `npm run db:migrate`. */
export async function migrate(): Promise<void> {
  await client().unsafe(SCHEMA).simple();
}

export async function closeDb(): Promise<void> {
  if (g.__pg) await g.__pg.end({ timeout: 5 });
  g.__pg = undefined;
}

export const userById = (id: string) => get<User>("SELECT * FROM AppUser WHERE id = ?", id);
export const userByEmail = (email: string) => get<User>("SELECT * FROM AppUser WHERE email = ?", email);
