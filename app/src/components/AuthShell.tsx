import Link from "next/link";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";

const points = ["Only the channels you trust", "Pomodoro timer & sitting reminders", "Planner, exam countdown & weekly stats"];

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-accent to-accent-2 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/10" />
        <Link href="/" className="relative flex items-center gap-2 text-xl font-bold">
          <Icon name="target" className="h-7 w-7" /> Focus Study
        </Link>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight">Learn from YouTube.<br />Skip the rabbit hole.</h2>
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-white/90">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20"><Icon name="check" className="h-4 w-4" /></span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">Built for students who want to actually finish their syllabus.</p>
      </section>

      <section className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold lg:invisible">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white"><Icon name="target" className="h-4 w-4" /></span>
            Focus Study
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
