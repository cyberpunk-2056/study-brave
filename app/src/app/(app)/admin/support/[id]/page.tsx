import Link from "next/link";
import { notFound } from "next/navigation";
import { markSupportRead, sendMessage } from "@/app/actions/admin";
import { SupportSendForm } from "@/components/SupportSendForm";
import { SupportThread } from "@/components/SupportThread";
import { all, userById, type Message } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export default async function AdminSupportThread({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const student = await userById(id);
  if (!student) notFound();

  await markSupportRead(id);
  const messages = await all<Message>(
    "SELECT * FROM Message WHERE userId = ? AND fromRole IN ('STUDENT','ADMIN') ORDER BY createdAt ASC LIMIT 200",
    id,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/support" className="text-sm text-accent hover:underline">← All conversations</Link>
      <div>
        <h1 className="page-title">{student.name}</h1>
        <p className="text-muted">{student.email}</p>
      </div>
      <div className="card flex h-[60vh] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <SupportThread messages={messages} meRole="ADMIN" />
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <SupportSendForm action={sendMessage} placeholder="Reply…" hidden={{ id }} />
        </div>
      </div>
    </div>
  );
}
