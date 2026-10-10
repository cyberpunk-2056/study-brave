import Link from "next/link";
import { redirect } from "next/navigation";
import { signup } from "@/app/actions/auth";
import { ActionForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getUser } from "@/lib/session";

export default async function SignupPage() {
  if (await getUser()) redirect("/dashboard");
  return (
    <AuthShell title="Create your account" subtitle="Study without YouTube distractions.">
      <ActionForm
        action={signup}
        submit="Sign up"
        fields={[
          { name: "name", label: "Full name", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "phone", label: "Phone number", type: "tel", autoComplete: "tel", placeholder: "+91 98765 43210" },
          { name: "parentEmail", label: "Parent / guardian email", type: "email", placeholder: "Used to approve early unlocks" },
          { name: "password", label: "Password (min 8 characters)", type: "password", autoComplete: "new-password" },
        ]}
      />
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
