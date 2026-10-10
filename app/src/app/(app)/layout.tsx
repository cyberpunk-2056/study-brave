import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";
import { SidebarLinks, TabBar, type NavItem } from "@/components/NavLinks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Timer } from "@/components/Timer";
import { requireUser } from "@/lib/session";

const main: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/videos", label: "Videos", icon: "video" },
  { href: "/discover", label: "Find channels", icon: "compass" },
  { href: "/saved", label: "Saved", icon: "bookmark" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/planner", label: "Planner", icon: "tasks" },
  { href: "/analytics", label: "Analytics", icon: "chart" },
  { href: "/profile", label: "Profile", icon: "user" },
];

// Five most-used destinations for the phone tab bar.
const tabs: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/videos", label: "Videos", icon: "video" },
  { href: "/planner", label: "Planner", icon: "tasks" },
  { href: "/analytics", label: "Stats", icon: "chart" },
  { href: "/profile", label: "Me", icon: "user" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = user.role === "ADMIN" ? [...main, { href: "/admin", label: "Admin panel", icon: "shield" as const }] : main;

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface p-4 lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 text-xl font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
            <Icon name="target" />
          </span>
          Focus Study
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarLinks items={items} />
        </div>
        <form action={logout} className="mt-3">
          <button className="btn-ghost w-full !justify-start">
            <Icon name="logout" /> Log out
          </button>
        </form>
      </aside>

      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white">
              <Icon name="target" className="h-4 w-4" />
            </span>
          </Link>
          <form action="/discover" className="relative flex-1 sm:max-w-xl">
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input name="q" required className="input !rounded-full !pl-10" placeholder="Search YouTube for study channels…" aria-label="Search channels" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 font-semibold text-white" title={user.name}>
              {user.name.charAt(0).toUpperCase()}
            </Link>
            <form action={logout} className="lg:hidden">
              <button className="btn-ghost !px-2.5" aria-label="Log out"><Icon name="logout" /></button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-40 sm:px-6 lg:pb-24">{children}</main>
      <TabBar items={tabs} />
      <Timer level={user.role === "STUDENT" ? user.strictMode : 0} />
    </div>
  );
}
