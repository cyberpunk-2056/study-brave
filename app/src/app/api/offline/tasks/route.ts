import { all, get, newId, run, type Task } from "@/lib/db";
import { isDesktopRequest } from "@/lib/desktop";
import { getUser } from "@/lib/session";

// To-do list sync for the desktop taskbar. The app keeps its own copy so the list works offline, and replays the
// changes it made (add / toggle / delete) here. The server answers with the full, up-to-date list.

type Op = { op: "add"; localId: string; title: string } | { op: "toggle"; id: string } | { op: "delete"; id: string };

const list = async (userId: string) =>
  (await all<Task>("SELECT * FROM Task WHERE userId = ? ORDER BY done, createdAt DESC LIMIT 100", userId)).map((t) => ({ id: t.id, title: t.title, done: t.done }));

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  if (!isDesktopRequest(req.headers)) return Response.json({ error: "Desktop app only" }, { status: 403 });

  let body: { ops?: Op[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const idMap: Record<string, string> = {}; // tasks created offline get their real id here
  const resolve = (id: unknown) => idMap[String(id)] ?? String(id);
  for (const op of (body.ops ?? []).slice(0, 200)) {
    if (!op || typeof op !== "object") continue;
    if (op.op === "add") {
      const title = String(op.title ?? "").trim().slice(0, 120);
      if (!title || typeof op.localId !== "string") continue;
      const id = newId();
      await run("INSERT INTO Task (id, userId, title, createdAt) VALUES (?,?,?,?)", id, user.id, title, Date.now());
      idMap[op.localId] = id;
    } else if (op.op === "toggle") {
      const t = await get<{ done: number }>("SELECT done FROM Task WHERE id = ? AND userId = ?", resolve(op.id), user.id);
      if (t) await run("UPDATE Task SET done = ? WHERE id = ?", t.done ? 0 : 1, resolve(op.id));
    } else if (op.op === "delete") {
      await run("DELETE FROM Task WHERE id = ? AND userId = ?", resolve(op.id), user.id);
    }
  }
  return Response.json({ tasks: await list(user.id), idMap }, { headers: { "Cache-Control": "no-store" } });
}
