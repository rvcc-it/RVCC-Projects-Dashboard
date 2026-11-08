"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form-field";
import { passwordSchema } from "@/lib/validators";

const schema = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        setError(null);
        const r = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: v.password }) });
        if (r.ok) {
          toast.success("Password updated. Please sign in.");
          router.replace("/login");
        } else setError((await r.json().catch(() => ({}))).error ?? "Could not reset the password.");
      })}
    >
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <Field label="New password" htmlFor="password" error={formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" autoFocus {...register("password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
      </Field>
      <Button type="submit" className="h-10" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />} Update password
      </Button>
    </form>
  );
}
