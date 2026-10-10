import { isDesktopRequest } from "@/lib/desktop";

// Tells the caller whether this request really comes from Focus Study Desktop (used for diagnostics/tests).
export async function GET(req: Request) {
  return Response.json({ desktop: isDesktopRequest(req.headers) }, { headers: { "Cache-Control": "no-store" } });
}
