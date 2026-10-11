// Shown instantly while a page loads, so navigation feels immediate instead of frozen.
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-soft" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-soft" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_2fr]">
        <div className="h-44 animate-pulse rounded-2xl bg-soft" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-soft" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-soft" />
        <div className="h-64 animate-pulse rounded-2xl bg-soft" />
      </div>
    </div>
  );
}
