import { ChannelLogo } from "@/components/ChannelLogo";
import Link from "next/link";
import { changePassword, updateProfile } from "@/app/actions/profile";
import { removeChannel } from "@/app/actions/study";
import { Icon } from "@/components/Icon";
import { SimpleForm } from "@/components/SimpleForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { all, get, type Channel } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDuration } from "@/lib/stats";

const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1•••$2");

export default async function Profile() {
  const user = await requireUser();
  const channels = await all<Channel>("SELECT * FROM Channel WHERE userId = ? ORDER BY title", user.id);
  const totals = await get<{ focus: number; sit: number; n: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind='FOCUS' THEN seconds END),0) focus,
            COALESCE(SUM(CASE WHEN kind='SITTING' THEN seconds END),0) sit,
            COALESCE(SUM(CASE WHEN kind='FOCUS' THEN 1 ELSE 0 END),0) n
     FROM StudySession WHERE userId = ?`,
    user.id,
  );
  const saved = (await get<{ n: number }>("SELECT COUNT(*) n FROM SavedVideo WHERE userId = ?", user.id))?.n ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="card flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-3xl font-bold text-white">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="truncate text-sm text-muted">{user.email}{user.phone && ` · ${user.phone}`}</p>
          <p className="text-xs text-muted">Member since {new Date(user.createdAt).toLocaleDateString()}</p>
        </div>
        <ThemeToggle withLabel />
      </div>

      {user.role === "STUDENT" && (
        <div className="card flex flex-wrap items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Study lock: {user.strictMode === 2 ? "ON · desktop app required" : user.strictMode ? "ON" : "OFF"}</h2>
            <p className="text-sm text-muted">
              {user.strictMode
                ? "Your timer keeps you in full-screen until it finishes. Stopping early needs a code from your parent or admin."
                : "Your admin has turned the full-screen lock off."}
              {user.parentEmail && <> Codes go to <b>{maskEmail(user.parentEmail)}</b> and your admin.</>}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total focus", fmtDuration(totals?.focus ?? 0)],
          ["Focus sessions", String(totals?.n ?? 0)],
          ["Sitting time", fmtDuration(totals?.sit ?? 0)],
          ["Saved videos", String(saved)],
        ].map(([l, v]) => (
          <div key={l} className="card !p-4">
            <div className="text-sm text-muted">{l}</div>
            <div className="mt-1 text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Edit profile</h2>
          <SimpleForm
            action={updateProfile}
            submit="Save changes"
            defaults={{ name: user.name, phone: user.phone ?? "" }}
            fields={[{ name: "name", label: "Full name" }, { name: "phone", label: "Phone number", type: "tel" }]}
          />
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Change password</h2>
          <SimpleForm
            action={changePassword}
            submit="Update password"
            fields={[
              { name: "current", label: "Current password", type: "password", autoComplete: "current-password" },
              { name: "next", label: "New password (min 8)", type: "password", autoComplete: "new-password" },
            ]}
          />
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">My study channels ({channels.length})</h2>
          <Link href="/discover" className="text-sm text-accent hover:underline">+ Find channels</Link>
        </div>
        <ul className="divide-y divide-line">
          {channels.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <Link href={`/channel/${c.ytId}`} className="flex min-w-0 items-center gap-3 hover:text-accent">
                <ChannelLogo src={c.thumbnail} name={c.title} size={36} />
                <span className="truncate">{c.title}</span>
              </Link>
              <form action={removeChannel}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn-danger" aria-label={`Remove ${c.title}`}><Icon name="trash" className="h-4 w-4" /></button>
              </form>
            </li>
          ))}
        </ul>
        {channels.length === 0 && <p className="text-sm text-muted">No channels added yet.</p>}
      </div>
    </div>
  );
}
