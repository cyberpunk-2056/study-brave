"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-md space-y-3 text-center">
      <div className="text-4xl">😕</div>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">This page could not load. It is usually a short connection hiccup, so trying again often fixes it.</p>
      {error.digest && <p className="text-xs text-muted">Error code: {error.digest}</p>}
      <div className="flex justify-center gap-2">
        <button className="btn" onClick={reset}>Try again</button>
        <Link href="/dashboard" className="btn-ghost">Go home</Link>
      </div>
    </div>
  );
}
