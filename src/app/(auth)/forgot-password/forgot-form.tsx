"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck, Send } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form-field";

const schema = z.object({ email: z.string().trim().email("Enter a valid e-mail address") });

export function ForgotForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  if (done)
    return (
      <div className="rounded-xl border bg-card p-5 text-sm shadow-card">
        <MailCheck className="mb-2 size-6 text-primary" />
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-muted-foreground">If an active account exists for that address, a reset link has been sent. The link expires in 1 hour.</p>
      </div>
    );

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        setError(null);
        const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
        if (r.ok) setDone(true);
        else setError((await r.json().catch(() => ({}))).error ?? "Request failed.");
      })}
    >
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <Field label="E-mail" htmlFor="email" error={formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus {...register("email")} />
      </Field>
      <Button type="submit" className="h-10" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Send />} Send reset link
      </Button>
    </form>
  );
}
