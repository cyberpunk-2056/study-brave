import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getUser } from "@/lib/session";

const features: [IconName, string, string][] = [
  ["video", "Only trusted channels", "Search YouTube, add the channels you trust, and see only their videos. No recommendations, no Shorts."],
  ["timer", "Pomodoro & sitting timer", "Focus and break cycles that log your study time, plus reminders to stand up and stretch."],
  ["tasks", "Planner & exam countdown", "Keep a daily to-do list and see how many days are left until each exam."],
  ["chart", "Weekly analytics", "Daily goals, streaks, a study heatmap and a breakdown of time per subject."],
  ["bookmark", "Save & take notes", "Save videos for later and write notes right next to the player."],
  ["moon", "Light & dark mode", "Easy on the eyes at any hour, on phone, tablet or laptop."],
];

export default async function Home() {
  const user = await getUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2 text-lg font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white"><Icon name="target" /></span>
          Focus Study
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn-ghost">Log in</Link>
          <Link href="/signup" className="btn hidden sm:inline-flex">Sign up</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        <section className="py-14 text-center sm:py-24">
          <span className="badge bg-accent-soft text-accent">Made for students</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Learn from YouTube <span className="grad-text">without the rabbit hole</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            A calm study space with approved channels only, a built-in focus timer, a planner and weekly analytics.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn !px-6 !py-3 !text-base">Get started — it&apos;s free</Link>
            <Link href="/login" className="btn-ghost !px-6 !py-3 !text-base">I have an account</Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([icon, title, text]) => (
            <div key={title} className="card">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name={icon} className="h-6 w-6" /></span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
