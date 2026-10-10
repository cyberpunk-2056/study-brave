"use server";

import { revalidatePath } from "next/cache";
import { get, newId, run } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function addTask(form: FormData) {
  const user = await requireUser();
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  if (!title) return;
  await run("INSERT INTO Task (id, userId, title, createdAt) VALUES (?,?,?,?)", newId(), user.id, title, Date.now());
  revalidatePath("/", "layout");
}

export async function toggleTask(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  const t = await get<{ done: number }>("SELECT done FROM Task WHERE id = ? AND userId = ?", id, user.id);
  if (t) await run("UPDATE Task SET done = ? WHERE id = ?", t.done ? 0 : 1, id);
  revalidatePath("/", "layout");
}

export async function deleteTask(form: FormData) {
  const user = await requireUser();
  await run("DELETE FROM Task WHERE id = ? AND userId = ?", String(form.get("id")), user.id);
  revalidatePath("/", "layout");
}

export async function clearDoneTasks() {
  const user = await requireUser();
  await run("DELETE FROM Task WHERE userId = ? AND done = 1", user.id);
  revalidatePath("/", "layout");
}

export async function addExam(form: FormData) {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const date = String(form.get("examDate") ?? "");
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await run("INSERT INTO Exam (id, userId, name, examDate) VALUES (?,?,?,?)", newId(), user.id, name, date);
  revalidatePath("/", "layout");
}

export async function deleteExam(form: FormData) {
  const user = await requireUser();
  await run("DELETE FROM Exam WHERE id = ? AND userId = ?", String(form.get("id")), user.id);
  revalidatePath("/", "layout");
}
