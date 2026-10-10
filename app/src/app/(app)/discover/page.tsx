import { ChannelLogo } from "@/components/ChannelLogo";
import Link from "next/link";
import { ChannelButton } from "@/components/ChannelButton";
import { Icon } from "@/components/Icon";
import { all, type Channel } from "@/lib/db";
import { compactNum } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { searchChannels, type ChannelInfo } from "@/lib/youtube";

const SUGGESTIONS = ["Khan Academy", "Physics Wallah", "CrashCourse", "TED-Ed", "freeCodeCamp", "3Blue1Brown", "Organic Chemistry Tutor", "Unacademy"];

export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string; scope?: string }> }) {
  const user = await requireUser();
  const { q = "", scope } = await searchParams;
  const global = scope === "global" && user.role === "ADMIN";

  let results: ChannelInfo[] = [];
  let error = "";
  if (q.trim()) {
    if (!process.env.YOUTUBE_API_KEY) error = "YOUTUBE_API_KEY is not set in .env";
    else {
      try {
        results = await searchChannels(q);
      } catch (e) {
        error = e instanceof Error ? e.message : "Search failed";
      }
    }
  }

  const mine = await all<Channel>(
    global ? "SELECT * FROM Channel WHERE userId IS NULL" : "SELECT * FROM Channel WHERE userId = ? OR userId IS NULL",
    ...(global ? [] : [user.id]),
  );
  const added = new Set(mine.map((c) => c.ytId));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="page-title">{global ? "Approve channels for all students" : "Find study channels"}</h1>
        <p className="text-muted">
          {q ? <>Results from YouTube for “{q}”. Add the channels you trust.</> : "Search all of YouTube, then add the channels you want to study from."}
        </p>
      </div>

      <form className="relative">
        {global && <input type="hidden" name="scope" value="global" />}
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input name="q" defaultValue={q} required className="input !rounded-2xl !py-3.5 !pl-12 !text-base" placeholder="Channel name, e.g. Khan Academy" aria-label="Search channels" />
      </form>

      {!q && (
        <div>
          <p className="mb-2 text-sm font-medium text-muted">Popular study channels</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Link key={s} href={`/discover?q=${encodeURIComponent(s)}${global ? "&scope=global" : ""}`} className="chip">{s}</Link>
            ))}
          </div>
        </div>
      )}

      {error && <p className="alert-error">{error}</p>}
      {q && !error && results.length === 0 && <p className="text-muted">No channels found. Try a different name.</p>}

      <ul className="space-y-3">
        {results.map((c) => (
          <li key={c.ytId} className="card flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Link href={`/channel/${c.ytId}`} className="shrink-0">
                <ChannelLogo src={c.thumbnail} name={c.title} size={72} priority />
              </Link>
              <div className="min-w-0">
                <Link href={`/channel/${c.ytId}`} className="font-semibold hover:text-accent">{c.title}</Link>
                <div className="text-xs text-muted">
                  {c.subscribers != null && `${compactNum(c.subscribers)} subscribers`}
                  {c.videoCount != null && ` · ${compactNum(c.videoCount)} videos`}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>
              </div>
            </div>
            <div className="shrink-0"><ChannelButton ytId={c.ytId} added={added.has(c.ytId)} global={global} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
