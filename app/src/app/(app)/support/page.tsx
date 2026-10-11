import { redirect } from "next/navigation";
import { sendSupportMessage } from "@/app/actions/support";
import { SupportSendForm } from "@/components/SupportSendForm";
import { SupportThread } from "@/components/SupportThread";
import { all, type Message } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function Support() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin/support");

  const messages = await all<Message>(
    "SELECT * FROM Message WHERE userId = ? AND fromRole IN ('STUDENT','ADMIN') ORDER BY createdAt ASC LIMIT 200",
    user.id,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="page-title">Contact support</h1>
        <p className="text-muted">Have a question or a problem? Message your admin here — they&apos;ll reply in this same thread.</p>
      </div>
      <div className="card flex h-[65vh] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <SupportThread messages={messages} meRole="STUDENT" />
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <SupportSendForm action={sendSupportMessage} placeholder="Type a message…" />
        </div>
      </div>
    </div>
  );
}
