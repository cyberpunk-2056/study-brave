import { isDesktopRequest } from "@/lib/desktop";
import { getOfflineSecret } from "@/lib/lock";
import { getUser } from "@/lib/session";

// Everything the desktop app needs to keep working without internet: who the student is
// and the secret used to check offline unlock codes. Only the desktop app (app key) may fetch it.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  if (!isDesktopRequest(req.headers)) return Response.json({ error: "Desktop app only" }, { status: 403 });
  return Response.json(
    {
      user: { id: user.id, name: user.name, role: user.role, strictMode: user.role === "STUDENT" ? user.strictMode : 0, dailyGoalMin: user.dailyGoalMin },
      offlineSecret: user.role === "STUDENT" ? await getOfflineSecret(user.id) : null,
      serverTime: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
