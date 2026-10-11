import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="card max-w-md space-y-3 text-center">
        <div className="text-5xl">🧭</div>
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="text-sm text-muted">We could not find that page. It may have moved, or the link may be wrong.</p>
        <Link href="/" className="btn mt-2">Back to Focus Study</Link>
      </div>
    </main>
  );
}
