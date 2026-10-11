"use client";

// Last-resort page if the whole app fails to render. Uses plain styles because nothing else is available.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#f4f5fb", color: "#151833" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Focus Study hit a problem</h1>
          <p style={{ color: "#666b8a" }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "10px 18px", border: 0, borderRadius: 10, background: "#5b5bf0", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
