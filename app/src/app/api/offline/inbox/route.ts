import { all, type Announcement, type Message } from "@/lib/db";
import { isDesktopRequest } from "@/lib/desktop";
import { getUser } from "@/lib/session";

// Messages for the desktop taskbar: direct messages from the admin / parent plus recent announcements.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  if (!isDesktopRequest(req.headers)) return Response.json({ error: "Desktop app only" }, { status: 403 });

  const direct = (await all<Message>("SELECT * FROM Message WHERE userId = ? ORDER BY createdAt DESC LIMIT 50", user.id)).map((m) => ({
    id: `m:${m.id}`, fromRole: m.fromRole, fromName: m.fromName, body: m.body, at: m.createdAt, announcement: false,
  }));
  const news = (await all<Announcement>("SELECT * FROM Announcement WHERE createdAt > ? ORDER BY createdAt DESC LIMIT 20", Date.now() - 30 * 86400_000)).map((a) => ({
    id: `a:${a.id}`, fromRole: "ADMIN" as const, fromName: "Announcement", body: a.message, at: a.createdAt, announcement: true,
  }));
  const messages = [...direct, ...news].sort((a, b) => b.at - a.at).slice(0, 60);
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
