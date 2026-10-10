// The Postgres schema (Supabase). Idempotent: safe to run again at any time.
//
// Identifiers are unquoted, so Postgres stores them in lower case; lib/db.ts maps result columns back to the
// camelCase names the code uses. The users table is called AppUser because "User" is a reserved word in Postgres.
// Times are epoch milliseconds (BIGINT); flags are 0/1 integers.
//
// Row Level Security is switched ON for every table and NO policies are created. The app connects with the
// database owner role (bypasses RLS), while Supabase's public REST API (anon / authenticated keys) is blocked.

export const TABLES = [
  "AppUser", "PasswordReset", "Channel", "StudySession", "SavedVideo", "WatchHistory", "Task", "Exam",
  "UnlockCode", "LockEvent", "FocusRun", "OfflineSync", "Message", "Announcement",
] as const;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS AppUser (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT,
  passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'STUDENT', disabled INTEGER NOT NULL DEFAULT 0,
  dailyGoalMin INTEGER NOT NULL DEFAULT 120, lastLoginAt BIGINT, createdAt BIGINT NOT NULL,
  strictMode INTEGER NOT NULL DEFAULT 1, parentEmail TEXT, offlineSecret TEXT
);
CREATE TABLE IF NOT EXISTS PasswordReset (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  tokenHash TEXT NOT NULL UNIQUE, expiresAt BIGINT NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS Channel (
  id TEXT PRIMARY KEY, userId TEXT REFERENCES AppUser(id) ON DELETE CASCADE, ytId TEXT NOT NULL,
  title TEXT NOT NULL, thumbnail TEXT, uploadsId TEXT NOT NULL, createdAt BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS channel_owner_yt ON Channel (COALESCE(userId, ''), ytId);
CREATE TABLE IF NOT EXISTS StudySession (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, subject TEXT NOT NULL DEFAULT 'General', seconds INTEGER NOT NULL, startedAt BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS session_user_time ON StudySession (userId, startedAt);
CREATE TABLE IF NOT EXISTS SavedVideo (
  userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE, videoId TEXT NOT NULL,
  title TEXT NOT NULL, thumbnail TEXT NOT NULL, channelTitle TEXT NOT NULL, channelId TEXT NOT NULL,
  duration TEXT, savedAt BIGINT NOT NULL, PRIMARY KEY (userId, videoId)
);
CREATE TABLE IF NOT EXISTS WatchHistory (
  userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE, videoId TEXT NOT NULL,
  title TEXT NOT NULL, thumbnail TEXT NOT NULL, channelTitle TEXT NOT NULL, channelId TEXT NOT NULL,
  duration TEXT, watchedAt BIGINT NOT NULL, PRIMARY KEY (userId, videoId)
);
CREATE TABLE IF NOT EXISTS Task (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, createdAt BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS task_user ON Task (userId);
CREATE TABLE IF NOT EXISTS Exam (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  name TEXT NOT NULL, examDate TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS UnlockCode (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  codeHash TEXT NOT NULL, expiresAt BIGINT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0, issuedBy TEXT NOT NULL, createdAt BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS unlock_user ON UnlockCode (userId, createdAt);
CREATE TABLE IF NOT EXISTS LockEvent (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS lock_user ON LockEvent (userId, at);
CREATE TABLE IF NOT EXISTS FocusRun (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  subject TEXT NOT NULL, plannedSec INTEGER NOT NULL, creditedSec DOUBLE PRECISION NOT NULL DEFAULT 0,
  startedAt BIGINT NOT NULL, lastBeat BIGINT NOT NULL, state TEXT NOT NULL DEFAULT 'ACTIVE',
  locked INTEGER NOT NULL DEFAULT 0, endedAt BIGINT
);
CREATE INDEX IF NOT EXISTS run_user_state ON FocusRun (userId, state);
CREATE TABLE IF NOT EXISTS OfflineSync (
  clientId TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  claimedSec INTEGER NOT NULL, creditedSec INTEGER NOT NULL, flagged INTEGER NOT NULL DEFAULT 0,
  reason TEXT, startedAt BIGINT NOT NULL, syncedAt BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS offline_user ON OfflineSync (userId, syncedAt);
CREATE TABLE IF NOT EXISTS Message (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  fromRole TEXT NOT NULL, fromName TEXT NOT NULL, body TEXT NOT NULL, createdAt BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS message_user ON Message (userId, createdAt);
CREATE TABLE IF NOT EXISTS Announcement (
  id TEXT PRIMARY KEY, message TEXT NOT NULL, createdAt BIGINT NOT NULL
);

-- Block Supabase's public REST API: RLS on, no policies. (The app's own connection bypasses RLS.)
${TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join("\n")}
`;
