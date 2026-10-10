import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getUser } from "@/lib/session";

// Caching proxy for YouTube channel logos. YouTube's image CDN answers 429 "Too Many Requests" when a
// page asks for many logos at once, so we download each logo once, keep a copy in the temp folder while the
// server instance is warm, and answer with long browser caching (the desktop app / browser keeps it for 30 days).

const ALLOWED_HOSTS = new Set(["yt3.ggpht.com", "yt3.googleusercontent.com"]);
const CACHE_DIR = join(tmpdir(), "focus-study-img-cache"); // serverless: only /tmp is writable, and it may be wiped at any time
const MAX_BYTES = 2_000_000;
const inflight = new Map<string, Promise<{ body: Buffer; type: string } | null>>();

const HEADERS = {
  "Cache-Control": "private, max-age=2592000, immutable", // private: the route needs a login, so shared caches must not keep it
  "X-Content-Type-Options": "nosniff",
};

async function download(url: string): Promise<{ body: Buffer; type: string } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 FocusStudy" } });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) return null;
      const body = Buffer.from(await res.arrayBuffer());
      return body.length <= MAX_BYTES ? { body, type } : null;
    } catch {
      /* timeout or network error: retry */
    }
  }
  return null;
}

export async function GET(req: Request) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });

  let target: URL;
  try {
    target = new URL(new URL(req.url).searchParams.get("u") ?? "");
  } catch {
    return new Response("Bad URL", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) return new Response("Host not allowed", { status: 400 });

  const key = createHash("sha256").update(target.href).digest("hex");
  const file = join(CACHE_DIR, key);

  try {
    const [body, type] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
    return new Response(new Uint8Array(body), { headers: { ...HEADERS, "Content-Type": type } });
  } catch {
    /* not cached yet */
  }

  // Several requests for the same logo share one download.
  let job = inflight.get(key);
  if (!job) {
    job = download(target.href).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  const img = await job;
  if (!img) return new Response("Image unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await Promise.all([writeFile(file, img.body), writeFile(`${file}.type`, img.type)]);
  } catch {
    /* caching is best-effort */
  }
  return new Response(new Uint8Array(img.body), { headers: { ...HEADERS, "Content-Type": img.type } });
}
