"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/common/form-field";
import { loginSchema } from "@/lib/validators";

type Values = z.infer<typeof loginSchema>;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: "", password: "", remember: false } });
  const { register, handleSubmit, formState, setValue, watch } = form;

  async function onSubmit(values: Values) {
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Sign-in failed. Please try again.");
      return;
    }
    router.replace(data.mustChangePassword ? "/change-password" : next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <Field label="E-mail or username" htmlFor="identifier" error={formState.errors.identifier?.message}>
        <Input id="identifier" autoComplete="username" autoFocus placeholder="name@company.com" {...register("identifier")} aria-invalid={!!formState.errors.identifier} />
      </Field>
      <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="pr-10" {...register("password")} aria-invalid={!!formState.errors.password} />
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox id="remember" checked={!!watch("remember")} onCheckedChange={(c) => setValue("remember", c === true)} />
          <Label htmlFor="remember" className="text-sm font-normal">Remember me</Label>
        </div>
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Forgot password?</Link>
      </div>
      <Button type="submit" size="lg" disabled={formState.isSubmitting} className="mt-1 h-10">
        {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
      </Button>
    </form>
  );
}
