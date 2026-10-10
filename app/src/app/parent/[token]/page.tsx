import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ParentMessageForm } from "@/components/ParentMessageForm";
import { userById } from "@/lib/db";
import { userIdFromParentToken } from "@/lib/lock";

export const metadata: Metadata = { title: "Message your child", robots: { index: false, follow: false } };

// Public page opened from the link in the emails sent to parents (no account needed).
export default async function ParentMessagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = userIdFromParentToken(decodeURIComponent(token));
  const student = id ? await userById(id) : undefined;
  if (!student) {
    return (
      <AuthShell title="Link not valid">
        <p className="text-muted">This message link is not valid or has changed. Please use the link in the latest email from Focus Study.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Message ${student.name.split(" ")[0]}`} subtitle="Your message appears in the taskbar of the Focus Study app.">
      <ParentMessageForm token={decodeURIComponent(token)} />
    </AuthShell>
  );
}
