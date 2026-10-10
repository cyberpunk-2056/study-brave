# Focus Study — website

Next.js 16 app. Data lives in **Postgres (Supabase in production)**; it is hosted on **Vercel**.
See `../DEPLOY.md` for the step-by-step deployment guide.

## Run locally
```
npm install
npm run db:local        # terminal 1: local test Postgres (PGlite), no installation needed
npm run db:migrate      # terminal 2: create the tables
npm run seed            # create the first admin (ADMIN_EMAIL / ADMIN_PASSWORD from .env)
npm run dev             # http://localhost:3000
```
`.env` for local work needs `DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/postgres"` and
`DATABASE_POOL_MAX=1` (the local test database accepts one connection at a time). Copy `.env.example` as a start.

## Useful scripts
- `npm run db:migrate` — create / update the tables (safe to repeat)
- `npm run seed` — create or promote the admin account
- `npm run backup` — save every table to `backups/<date>.json`
- `npx tsx --env-file=.env scripts/test-db.ts` and `scripts/test-logic.ts` — database and anti-cheat checks
