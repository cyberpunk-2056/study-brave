import type { Message } from "@/lib/db";

const ROLE_LABEL: Record<Message["fromRole"], string> = { STUDENT: "You", ADMIN: "Support", PARENT: "Parent" };

/** A chat-style thread. `meRole` decides which side of the thread each message is aligned to. */
export function SupportThread({ messages, meRole }: { messages: Message[]; meRole: "STUDENT" | "ADMIN" }) {
  if (messages.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No messages yet.</p>;
  }
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const mine = m.fromRole === meRole;
        return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "bg-accent text-white" : "bg-soft text-fg"}`}>
              {!mine && <p className="mb-0.5 text-xs font-semibold opacity-70">{m.fromRole === "STUDENT" ? m.fromName : ROLE_LABEL[m.fromRole]}</p>}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`mt-1 text-right text-[11px] ${mine ? "text-white/70" : "text-muted"}`}>
                {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
