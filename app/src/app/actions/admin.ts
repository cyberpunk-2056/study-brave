"use server";

import { revalidatePath } from "next/cache";
import { get, newId, run, userById } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { createUnlockCode, currentOfflineCode, mailUnlockCode } from "@/lib/lock";
import { normalizeDomain } from "@/lib/sites";
import { resolveChannel } from "@/lib/youtube";
import type { FormState } from "./auth";

export async function toggleUser(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  if (id === admin.id) return;
  const u = await userById(id);
  if (u) await run("UPDATE AppUser SET disabled = ? WHERE id = ?", u.disabled ? 0 : 1, id);
  revalidatePath("/admin");
}

export async function setRole(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  if (id === admin.id) return;
  await run("UPDATE AppUser SET role = ? WHERE id = ?", form.get("role") === "ADMIN" ? "ADMIN" : "STUDENT", id);
  revalidatePath("/admin");
}

export async function deleteUser(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  if (id === admin.id) return;
  await run("DELETE FROM AppUser WHERE id = ?", id);
  revalidatePath("/admin");
}

export async function addGlobalChannel(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let info;
  try {
    info = await resolveChannel(String(form.get("channel") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "YouTube lookup failed" };
  }
  if (!info) return { error: "Channel not found" };
  if (await get("SELECT 1 FROM Channel WHERE userId IS NULL AND ytId = ?", info.ytId)) return { error: "Already approved" };
  await run(
    "INSERT INTO Channel (id, userId, ytId, title, thumbnail, uploadsId, createdAt) VALUES (?,NULL,?,?,?,?,?)",
    newId(), info.ytId, info.title, info.thumbnail, info.uploadsId, Date.now(),
  );
  revalidatePath("/admin/channels");
  return { ok: `Approved ${info.title} for all students` };
}

export async function removeGlobalChannel(form: FormData) {
  await requireAdmin();
  await run("DELETE FROM Channel WHERE id = ? AND userId IS NULL", String(form.get("id")));
  revalidatePath("/admin/channels");
}

export async function addGlobalChannelById(form: FormData) {
  await requireAdmin();
  const info = await resolveChannel(String(form.get("ytId") ?? ""));
  if (!info) return;
  if (!await get("SELECT 1 FROM Channel WHERE userId IS NULL AND ytId = ?", info.ytId)) {
    await run(
      "INSERT INTO Channel (id, userId, ytId, title, thumbnail, uploadsId, createdAt) VALUES (?,NULL,?,?,?,?,?)",
      newId(), info.ytId, info.title, info.thumbnail, info.uploadsId, Date.now(),
    );
  }
  revalidatePath("/", "layout");
}

export async function postAnnouncement(form: FormData) {
  await requireAdmin();
  const message = String(form.get("message") ?? "").trim().slice(0, 500);
  if (!message) return;
  await run("INSERT INTO Announcement (id, message, createdAt) VALUES (?,?,?)", newId(), message, Date.now());
  revalidatePath("/", "layout");
}

export async function deleteAnnouncement(form: FormData) {
  await requireAdmin();
  await run("DELETE FROM Announcement WHERE id = ?", String(form.get("id")));
  revalidatePath("/", "layout");
}

// ---------- External course sites ----------
// A domain an admin trusts (e.g. a purchased course platform). Opened inside the desktop app in its own
// locked-down tab — never a free address bar. See desktop/main.js ("course:open").

export async function addExternalSite(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!domain) return { error: "Enter a plain domain, e.g. udemy.com (its subdomains are covered automatically)." };
  const title = String(form.get("title") ?? "").trim().slice(0, 60) || domain;
  const studentId = String(form.get("studentId") ?? "").trim() || null;
  if (await get("SELECT 1 FROM ExternalSite WHERE COALESCE(userId,'') = ? AND domain = ?", studentId ?? "", domain))
    return { error: "Already approved" };
  await run(
    "INSERT INTO ExternalSite (id, userId, domain, title, addedBy, createdAt) VALUES (?,?,?,?,?,?)",
    newId(), studentId, domain, title, admin.id, Date.now(),
  );
  revalidatePath("/admin/sites");
  return { ok: `Approved ${domain}${studentId ? "" : " for every student"}` };
}

export async function removeExternalSite(form: FormData) {
  await requireAdmin();
  await run("DELETE FROM ExternalSite WHERE id = ?", String(form.get("id")));
  revalidatePath("/admin/sites");
  revalidatePath("/", "layout");
}

/** A student asked for a course site. Approving it both decides the request and adds the site for that student. */
export async function approveSiteRequest(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const reqRow = await get<{ userId: string; domain: string; title: string; status: string }>(
    "SELECT userId, domain, title, status FROM SiteRequest WHERE id = ?",
    id,
  );
  if (!reqRow || reqRow.status !== "PENDING") return;
  if (!await get("SELECT 1 FROM ExternalSite WHERE userId = ? AND domain = ?", reqRow.userId, reqRow.domain)) {
    await run(
      "INSERT INTO ExternalSite (id, userId, domain, title, addedBy, createdAt) VALUES (?,?,?,?,?,?)",
      newId(), reqRow.userId, reqRow.domain, reqRow.title, admin.id, Date.now(),
    );
  }
  await run("UPDATE SiteRequest SET status = 'APPROVED', decidedAt = ?, decidedBy = ? WHERE id = ?", Date.now(), admin.id, id);
  revalidatePath("/admin/sites");
  revalidatePath("/courses");
}

export async function rejectSiteRequest(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  await run(
    "UPDATE SiteRequest SET status = 'REJECTED', adminNote = ?, decidedAt = ?, decidedBy = ? WHERE id = ? AND status = 'PENDING'",
    note, Date.now(), admin.id, id,
  );
  revalidatePath("/admin/sites");
  revalidatePath("/courses");
}

// ---------- Study lock (strict full-screen mode) ----------

export async function setStrictMode(form: FormData) {
  await requireAdmin();
  // 0 = off, 1 = lock (full-screen / desktop app), 2 = must use the Focus Study Desktop app
  const mode = Math.max(0, Math.min(2, Number(form.get("mode")) || 0));
  await run("UPDATE AppUser SET strictMode = ? WHERE id = ?", mode, String(form.get("id")));
  revalidatePath("/", "layout");
}

export async function setParentEmail(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const email = String(form.get("parentEmail") ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Invalid email address" };
  await run("UPDATE AppUser SET parentEmail = ? WHERE id = ?", email || null, String(form.get("id")));
  revalidatePath("/admin");
  return { ok: email ? "Parent email saved" : "Parent email removed" };
}

/** Admin creates a code for a student: shown to the admin only, and also emailed to the parent. */
export async function generateUnlockCode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const student = await userById(String(form.get("id")));
  if (!student) return { error: "Student not found" };
  const code = await createUnlockCode(student.id, admin.id);
  try {
    await mailUnlockCode(student, code, `has an unlock code generated by admin ${admin.name}.`);
  } catch (e) {
    console.error("SMTP error", e);
  }
  return { ok: `Code: ${code}  (valid 15 minutes, works once)   ·   Offline code (works without internet): ${await currentOfflineCode(student.id)}` };
}

/** Admin sends a short message to one student. It appears in the desktop app's taskbar. */
export async function sendMessage(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const body = String(form.get("body") ?? "").trim().slice(0, 500);
  if (!await userById(id)) return { error: "Student not found" };
  if (!body) return { error: "Write a message first" };
  await run("INSERT INTO Message (id, userId, fromRole, fromName, body, createdAt) VALUES (?,?,?,?,?,?)", newId(), id, "ADMIN", admin.name, body, Date.now());
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${id}`);
  return { ok: "Message sent. The student sees it in the taskbar." };
}

/** Marks a student's support messages as seen — called when the admin opens that student's thread. */
export async function markSupportRead(studentId: string) {
  await requireAdmin();
  // Called from the thread page during render, not a form action — revalidatePath isn't allowed there. The
  // /admin/support list is a plain dynamic page, so it reads the fresh count next time it's opened regardless.
  await run("UPDATE Message SET read = 1 WHERE userId = ? AND fromRole = 'STUDENT' AND read = 0", studentId);
}
