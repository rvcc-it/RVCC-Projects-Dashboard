import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">Use at least 10 characters with letters and numbers.</p>
      {token ? (
        <ResetForm token={token} />
      ) : (
        <p className="text-sm text-destructive">This reset link is incomplete. <Link href="/forgot-password" className="underline">Request a new one</Link>.</p>
      )}
    </>
  );
}
