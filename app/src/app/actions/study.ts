"use server";

import { revalidatePath } from "next/cache";
import { get, newId, run } from "@/lib/db";
import { isLimited, minutes, recordHit } from "@/lib/ratelimit";
import { requireUser } from "@/lib/session";
import { normalizeDomain } from "@/lib/sites";
import { resolveChannel } from "@/lib/youtube";
import type { FormState } from "./auth";

export async function addChannel(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let info;
  try {
    info = await resolveChannel(String(form.get("channel") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "YouTube lookup failed" };
  }
  if (!info) return { error: "Channel not found. Paste a channel URL, @handle or channel ID." };
  if (await get("SELECT 1 FROM Channel WHERE userId = ? AND ytId = ?", user.id, info.ytId)) return { error: "Channel already added" };
  await run(
    "INSERT INTO Channel (id, userId, ytId, title, thumbnail, uploadsId, createdAt) VALUES (?,?,?,?,?,?,?)",
    newId(), user.id, info.ytId, info.title, info.thumbnail, info.uploadsId, Date.now(),
  );
  revalidatePath("/videos");
  return { ok: `Added ${info.title}` };
}

export async function removeChannel(form: FormData) {
  const user = await requireUser();
  await run("DELETE FROM Channel WHERE id = ? AND userId = ?", String(form.get("id")), user.id);
  revalidatePath("/videos");
}

/** Called by the timer to save a finished break / sitting block. */
export async function logSession(kind: "BREAK" | "SITTING", subject: string, seconds: number, startedAt: number) {
  const user = await requireUser();
  // FOCUS time is NOT accepted from the browser: the server measures it itself (see actions/focus.ts).
  if (kind !== "BREAK" && kind !== "SITTING") return;
  const secs = Math.min(Math.floor(seconds), 6 * 3600);
  if (!(secs >= 10)) return;
  await run(
    "INSERT INTO StudySession (id, userId, kind, subject, seconds, startedAt) VALUES (?,?,?,?,?,?)",
    newId(), user.id, kind, subject.trim().slice(0, 40) || "General", secs, Math.floor(startedAt),
  );
  revalidatePath("/dashboard");
  revalidatePath("/overview");
  revalidatePath("/analytics");
}

export async function setGoal(form: FormData) {
  const user = await requireUser();
  const min = Math.max(10, Math.min(1000, Number(form.get("minutes")) || 120));
  await run("UPDATE AppUser SET dailyGoalMin = ? WHERE id = ?", min, user.id);
  revalidatePath("/dashboard");
  revalidatePath("/overview");
}

// ---------- Channels (by id, from search results / channel page) ----------

export async function addChannelById(form: FormData) {
  const user = await requireUser();
  const info = await resolveChannel(String(form.get("ytId") ?? ""));
  if (!info) return;
  if (!await get("SELECT 1 FROM Channel WHERE userId = ? AND ytId = ?", user.id, info.ytId)) {
    await run(
      "INSERT INTO Channel (id, userId, ytId, title, thumbnail, uploadsId, createdAt) VALUES (?,?,?,?,?,?,?)",
      newId(), user.id, info.ytId, info.title, info.thumbnail, info.uploadsId, Date.now(),
    );
  }
  revalidatePath("/", "layout");
}

export async function removeChannelByYtId(form: FormData) {
  const user = await requireUser();
  await run("DELETE FROM Channel WHERE userId = ? AND ytId = ?", user.id, String(form.get("ytId")));
  revalidatePath("/", "layout");
}

// ---------- Saved videos ----------

export async function toggleSave(form: FormData) {
  const user = await requireUser();
  const videoId = String(form.get("videoId") ?? "");
  if (!/^[\w-]{11}$/.test(videoId)) return;
  if (await get("SELECT 1 FROM SavedVideo WHERE userId = ? AND videoId = ?", user.id, videoId)) {
    await run("DELETE FROM SavedVideo WHERE userId = ? AND videoId = ?", user.id, videoId);
  } else {
    await run(
      "INSERT INTO SavedVideo (userId, videoId, title, thumbnail, channelTitle, channelId, duration, savedAt) VALUES (?,?,?,?,?,?,?,?)",
      user.id, videoId, String(form.get("title")).slice(0, 300), String(form.get("thumbnail")).slice(0, 300),
      String(form.get("channelTitle")).slice(0, 200), String(form.get("channelId")).slice(0, 40),
      form.get("duration") ? String(form.get("duration")) : null, Date.now(),
    );
  }
  revalidatePath("/", "layout");
}

export async function clearHistory() {
  const user = await requireUser();
  await run("DELETE FROM WatchHistory WHERE userId = ?", user.id);
  revalidatePath("/history");
}

// ---------- Requesting a course site ----------
// A student can't approve their own course sites — this only creates a PENDING request an admin has to accept or
// reject (see app/actions/admin.ts: approveSiteRequest / rejectSiteRequest).
export async function requestExternalSite(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!domain) return { error: "Enter a plain domain, e.g. udemy.com" };
  const title = String(form.get("title") ?? "").trim().slice(0, 60) || domain;
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200) || null;

  if (await get("SELECT 1 FROM ExternalSite WHERE (userId = ? OR userId IS NULL) AND domain = ?", user.id, domain))
    return { error: "That site is already approved for you." };
  if (await get("SELECT 1 FROM SiteRequest WHERE userId = ? AND domain = ? AND status = 'PENDING'", user.id, domain))
    return { error: "You already asked for this site — waiting on your admin." };

  const key = `siterequest:user:${user.id}`;
  const lim = await isLimited(key, 10);
  if (lim.limited) return { error: `Too many requests. Try again in ${minutes(lim.retryAfterSec)} minutes.` };
  await recordHit(key, 24 * 60 * 60_000);

  await run(
    "INSERT INTO SiteRequest (id, userId, domain, title, reason, createdAt) VALUES (?,?,?,?,?,?)",
    newId(), user.id, domain, title, reason, Date.now(),
  );
  revalidatePath("/courses");
  return { ok: "Sent to your admin. You'll see it here once they decide." };
}
