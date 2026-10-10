import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot password" subtitle="Enter your email and we will send you a reset link.">
      <ActionForm
        action={forgotPassword}
        submit="Send reset link"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
      />
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-accent hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}
