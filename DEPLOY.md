# Deploying Focus Study on Vercel + Supabase

You will set up three things, in this order: the **database** (Supabase), the **website** (Vercel), and the
**Windows app** (pointing at your website). Allow about an hour the first time.

```
Students' PCs ──(Focus Study Desktop app)──►  https://your-site.vercel.app  ──►  Supabase Postgres
                                                  (website, runs on Vercel)        (all the data)
```

## 0. What you need
- A GitHub account (Vercel deploys from GitHub), a Vercel account, a Supabase account.
- This project on your PC, with Node.js 22 or newer installed.
- (Recommended) a Google account for the YouTube API key and a mailbox for sending emails (Gmail works).

## 1. Create the database (Supabase)
1. supabase.com → **New project**. Pick the **region closest to your students**. Choose a strong **database password** and
   save it somewhere safe. Wait until the project is ready.
2. Open **Project Settings → Database → Connection string** and choose **Transaction pooler** (port **6543**).
   Copy it and replace `[YOUR-PASSWORD]` with your database password. This is your `DATABASE_URL`.
   - Always use the *pooler* string on Vercel; the "Direct connection" one can fail because Vercel is IPv4-only.
3. You do **not** need Supabase Auth, Storage or the API keys. The app has its own login and talks to the database
   directly. (All tables are created with Row Level Security on and no policies, so Supabase's public API cannot read them.)

## 2. Make your secrets
Run these on your PC (each prints a long random string). You need three: `SESSION_SECRET`, `DESKTOP_APP_KEY`
and a strong admin password of your own.
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Other values: `YOUTUBE_API_KEY` (Google Cloud Console → *YouTube Data API v3* → create key, restrict it to that API) and
the `SMTP_*` details for email. See `app/.env.example` for every setting.

## 3. Create the tables and the first admin (from your PC)
1. In the `app` folder copy `.env.example` to `.env` and fill in at least `DATABASE_URL`, `SESSION_SECRET`,
   `ADMIN_EMAIL` and `ADMIN_PASSWORD`. **Delete the `DATABASE_POOL_MAX` line** if it is there.
2. Run:
   ```
   cd app
   npm install
   npm run db:migrate     # creates all tables in Supabase (safe to repeat)
   npm run seed           # creates the admin account
   ```
3. In Supabase → **Table editor** you should now see the tables (AppUser, Task, StudySession, …) with RLS enabled.

> **Updating an existing deployment:** always run `npm run db:migrate` against Supabase **before** deploying new code.
> It only adds things (the `RateLimit` table, the `passwordChangedAt` column used by login protection, the
> `ExternalSite` table used by admin-approved course websites, the `SiteRequest` table for a student's requests to
> approve a new one, and a `read` column on `Message` used by the admin's Support inbox) and never deletes data.

## 4. Put the code on GitHub
Create a new **private** repository and push the whole project folder (it contains `app/` and `desktop/`).
`.env` files are ignored by git, so your secrets are not uploaded. Never commit them.

## 5. Deploy the website (Vercel)
1. vercel.com → **Add New → Project** → import your repository.
2. **Root Directory: `app`** (important). Framework: Next.js (auto-detected). Leave the build settings alone.
3. Open **Environment Variables** and add (same names as `.env.example`):
   `DATABASE_URL`, `SESSION_SECRET`, `DESKTOP_APP_KEY`, `APP_URL`, `YOUTUBE_API_KEY`, `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
   - `APP_URL` is your final address, e.g. `https://focus-study.vercel.app` (you can edit it after the first deploy).
   - Do **not** add `ADMIN_*` here; they are only for the seed command on your PC.
4. **Settings → Functions → Region**: choose the region closest to your Supabase region (e.g. both in Mumbai or both in Frankfurt).
   This makes every page much faster.
5. **Deploy.** When it finishes, open the address and log in with your admin email and password.

Quick checks: `/login` loads, the admin panel opens, **Admin → Approved channels** can search YouTube, and a
test student can sign up.

## 6. Build the Windows app for your students
1. Copy `desktop/config.example.json` to `desktop/config.json` (it is not stored in git because it holds the app key) and set:
   ```json
   { "url": "https://your-project.vercel.app", "appKey": "<the same DESKTOP_APP_KEY you put in Vercel>" }
   ```
2. In the `desktop` folder run `npm install` then `npm run dist`. Installers appear in `desktop/dist/`
   (`...-x64.exe` for Intel/AMD PCs, `...-arm64.exe` for ARM PCs, and one file containing both).
3. Install on a test PC, log in once while online, and try a focus session.

If you change the website address or the app key later, edit `config.json` and build the installers again.

## 7. After launch
- **Backups:** the free Supabase plan has no automatic backups. Run `npm run backup` from the `app` folder regularly
  (it saves `backups/<date>.json`); keep the file private. Paid Supabase plans include daily backups.
- **Free-plan limits (check current terms):** Supabase may pause a free project after about a week of no use (open the
  dashboard and press *Restore*), and Vercel's free *Hobby* plan is for personal, non-commercial use. A school or
  business should use the Pro plan.
- **Custom domain:** Vercel → Settings → Domains. Then update `APP_URL`, `desktop/config.json`, and rebuild the installers.
- **Change defaults:** log in and change the admin password; never keep `Admin@12345`.
- **Rotate keys** if one is ever shared by accident (database password, `SESSION_SECRET`, `DESKTOP_APP_KEY`, YouTube key).

## Troubleshooting
| Symptom | Likely cause |
|---|---|
| "DATABASE_URL is not set" | The variable is missing in Vercel. Add it and redeploy. |
| "Tenant or user not found" / login to database fails | Wrong password or the wrong connection string. Use the **Transaction pooler** string and your DB password. |
| Pages are slow | Vercel and Supabase are in different regions. Change the Vercel function region. |
| Emails are not sent | `SMTP_*` not set (for Gmail use an App Password). |
| Desktop app says it cannot reach Focus Study | Wrong `url` in `desktop/config.json`, or the installer was built before you changed it. |
| "Your admin requires the Desktop app" in a browser | Intended: that student is set to *Desktop app required*. |

## How much does it cost to run?
Roughly: Supabase free (or about $25/month Pro), Vercel free for personal use (about $20/month Pro for a school or
business), plus a domain (about $10–15/year) and optional code signing for the installer (about $100–300/year).
Prices change; check each provider.
