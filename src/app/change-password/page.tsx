import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { requirePageUser } from "@/server/auth";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export const metadata: Metadata = { title: "Change password" };

// Shown right after an administrator created / reset the account: the temporary password must be replaced.
export default async function ChangePasswordPage() {
  const user = await requirePageUser({ allowMustChange: true });
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8" />
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-1.5 mb-7 text-sm text-muted-foreground">
          {user.mustChangePassword ? "For your security, replace the temporary password before continuing." : "Choose a new password for your account."}
        </p>
        <ChangePasswordForm redirectTo="/" />
      </div>
    </main>
  );
}
