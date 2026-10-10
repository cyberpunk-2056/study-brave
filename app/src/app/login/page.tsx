import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { ActionForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getUser } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (await getUser()) redirect("/dashboard");
  const { reset } = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue studying.">
      {reset && <p className="alert-ok mb-4">Password updated. Please log in.</p>}
      <ActionForm
        action={login}
        submit="Log in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
      <div className="mt-5 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-accent hover:underline">
          Forgot password?
        </Link>
        <Link href="/signup" className="text-accent hover:underline">
          Create account
        </Link>
      </div>
    </AuthShell>
  );
}
