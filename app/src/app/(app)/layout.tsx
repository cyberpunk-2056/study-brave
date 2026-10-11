import Link from "next/link";
import { Icon } from "@/components/Icon";
import { TabBar, type NavItem } from "@/components/NavLinks";
import { SideMenu } from "@/components/SideMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FloatingTimer } from "@/components/timer/FloatingTimer";
import { TimerProvider } from "@/components/timer/TimerProvider";
import { requireUser } from "@/lib/session";

const main: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/overview", label: "Overview", icon: "focus" },
  { href: "/videos", label: "Videos", icon: "video" },
  { href: "/discover", label: "Find channels", icon: "compass" },
  { href: "/courses", label: "Course sites", icon: "globe" },
  { href: "/saved", label: "Saved", icon: "bookmark" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/planner", label: "Planner", icon: "tasks" },
  { href: "/analytics", label: "Analytics", icon: "chart" },
  { href: "/profile", label: "Profile", icon: "user" },
  { href: "/support", label: "Support", icon: "chat" },
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
    <TimerProvider level={user.role === "STUDENT" ? user.strictMode : 0}>
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <SideMenu
            items={items}
            user={{ name: user.name, email: user.email, role: user.role, dailyGoalMin: user.dailyGoalMin, strictMode: user.strictMode, parentEmail: user.parentEmail }}
          />
          <Link href="/dashboard" className="hidden items-center gap-2 font-bold sm:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white">
              <Icon name="target" className="h-4 w-4" />
            </span>
            Focus Study
          </Link>
          <form action="/discover" className="relative flex-1 sm:max-w-xl">
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input name="q" required className="input !rounded-full !pl-10" placeholder="Search channels…" aria-label="Search YouTube for study channels" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 font-semibold text-white" title={user.name}>
              {user.name.charAt(0).toUpperCase()}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-40 sm:px-6 lg:pb-24">{children}</main>
      <TabBar items={tabs} />
      <FloatingTimer />
    </div>
    </TimerProvider>
  );
}
