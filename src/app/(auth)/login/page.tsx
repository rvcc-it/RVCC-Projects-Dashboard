import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  // Already signed in (valid session in the database)? Skip the form.
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : safeNext);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">Sign in with your company account to continue.</p>
      <LoginForm next={safeNext} />
    </>
  );
}
