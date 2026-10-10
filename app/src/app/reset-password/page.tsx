import Link from "next/link";
import { resetPassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthShell title="Invalid link">
        <p className="text-sm">
          This reset link is missing its token.{" "}
          <Link href="/forgot-password" className="text-accent hover:underline">
            Request a new one
          </Link>
          .
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Set a new password">
      <ActionForm
        action={resetPassword}
        submit="Update password"
        hidden={{ token }}
        fields={[{ name: "password", label: "New password (min 8 characters)", type: "password", autoComplete: "new-password" }]}
      />
    </AuthShell>
  );
}
