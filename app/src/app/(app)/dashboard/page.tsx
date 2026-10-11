import { Calculator } from "@/components/Calculator";
import { CourseSiteIcon } from "@/components/CourseSiteIcon";
import { DesktopIcon } from "@/components/DesktopIcon";
import { GmailIcon } from "@/components/GmailIcon";
import { Icon } from "@/components/Icon";
import { QuickNotes } from "@/components/QuickNotes";
import { SettingsPanel } from "@/components/SettingsPanel";
import { all, get, type Announcement, type ExternalSite } from "@/lib/db";
import { quoteOfTheDay } from "@/lib/quotes";
import { requireUser } from "@/lib/session";

/**
 * The "Home" screen — a desktop-style icon grid instead of a classic app menu: every main area of the site,
 * the student's approved course sites, and Settings are all one click away, the way shortcuts work on a real
 * desktop. The old stats-and-planner dashboard still exists at /overview, one of the icons below.
 */
export default async function Dashboard() {
  const user = await requireUser();
  const [news, sites, openTasks] = await Promise.all([
    all<Announcement>("SELECT * FROM Announcement WHERE createdAt > ? ORDER BY createdAt DESC LIMIT 3", Date.now() - 14 * 86400_000),
    user.role === "STUDENT"
      ? all<ExternalSite>("SELECT * FROM ExternalSite WHERE userId = ? OR userId IS NULL ORDER BY title", user.id)
      : Promise.resolve([] as ExternalSite[]),
    get<{ n: number }>("SELECT COUNT(*) n FROM Task WHERE userId = ? AND done = 0", user.id),
  ]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const taskBadge = openTasks?.n ? String(Math.min(99, openTasks.n)) : undefined;

  return (
    <div className="space-y-6">
      {news.map((n) => (
        <div key={n.id} className="flex items-start gap-3 rounded-2xl border border-line bg-warn-bg px-4 py-3 text-warn-fg">
          <Icon name="megaphone" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="text-sm font-semibold">Announcement</div>
            <p className="text-sm">{n.message}</p>
          </div>
        </div>
      ))}

      {/* The "desktop": a wallpaper-style panel holding every shortcut, icon-grid style. */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-accent-2 p-5 text-white sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/5" />
        <div className="relative">
          <h1 className="text-xl font-bold sm:text-2xl">{greeting}, {user.name.split(" ")[0]} 👋</h1>
          <p className="mt-1 text-sm text-white/85">“{quoteOfTheDay()}”</p>
        </div>

        <div className="relative mt-6">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-white/70">Apps</h2>
          <div className="flex flex-wrap gap-1 sm:gap-2">
            <DesktopIcon href="/overview" icon="focus" label="Overview" />
            <DesktopIcon href="/videos" icon="video" label="Videos" />
            <DesktopIcon href="/discover" icon="compass" label="Find channels" />
            <DesktopIcon href="/courses" icon="globe" label="Course sites" />
            <DesktopIcon href="/saved" icon="bookmark" label="Saved" />
            <DesktopIcon href="/history" icon="history" label="History" />
            <DesktopIcon href="/planner" icon="tasks" label="Planner" badge={taskBadge} />
            <DesktopIcon href="/analytics" icon="chart" label="Analytics" />
            <DesktopIcon href="/profile" icon="user" label="Profile" />
            <DesktopIcon href="/support" icon="chat" label="Support" />
            <SettingsPanel
              variant="tile"
              user={{ name: user.name, email: user.email, role: user.role, dailyGoalMin: user.dailyGoalMin, strictMode: user.strictMode, parentEmail: user.parentEmail }}
            />
            {user.role === "ADMIN" && <DesktopIcon href="/admin" icon="shield" label="Admin panel" />}
          </div>
        </div>

        <div className="relative mt-6 border-t border-white/15 pt-5">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-white/70">Tools</h2>
          <div className="flex flex-wrap gap-1 sm:gap-2">
            <Calculator />
            <QuickNotes />
            <DesktopIcon href="/files" icon="folder" label="My Files" />
            <GmailIcon />
          </div>
        </div>

        {sites.length > 0 && (
          <div className="relative mt-6 border-t border-white/15 pt-5">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-white/70">Your course sites</h2>
            <div className="flex flex-wrap gap-1 sm:gap-2">
              {sites.map((s) => (
                <CourseSiteIcon key={s.id} domain={s.domain} title={s.title} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
