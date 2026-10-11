import { all } from "@/lib/db";
import { isDesktopRequest } from "@/lib/desktop";
import { getOfflineSecret } from "@/lib/lock";
import { getUser } from "@/lib/session";

// Everything the desktop app needs to keep working without internet: who the student is, the secret used to check
// offline unlock codes, and the external course sites they're approved to open. Only the desktop app (app key) may
// fetch it.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  if (!isDesktopRequest(req.headers)) return Response.json({ error: "Desktop app only" }, { status: 403 });
  const externalSites =
    user.role === "STUDENT"
      ? await all<{ domain: string; title: string }>(
          "SELECT domain, title FROM ExternalSite WHERE userId = ? OR userId IS NULL ORDER BY title",
          user.id,
        )
      : [];
  return Response.json(
    {
      user: { id: user.id, name: user.name, role: user.role, strictMode: user.role === "STUDENT" ? user.strictMode : 0, dailyGoalMin: user.dailyGoalMin },
      offlineSecret: user.role === "STUDENT" ? await getOfflineSecret(user.id) : null,
      externalSites,
      serverTime: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
