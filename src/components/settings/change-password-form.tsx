"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form-field";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validators";
import { changePasswordAction } from "@/actions/users";

export function ChangePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const { register, handleSubmit, formState, setError, reset } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        const r = await changePasswordAction(v);
        if (r.ok) {
          toast.success("Password changed");
          reset();
          if (redirectTo) {
            router.replace(redirectTo);
            router.refresh();
          }
        } else {
          Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof ChangePasswordInput, { message: m }));
          toast.error(r.error);
        }
      })}
    >
      <Field label="Current password" htmlFor="currentPassword" error={formState.errors.currentPassword?.message}>
        <Input id="currentPassword" type="password" autoComplete="current-password" {...register("currentPassword")} />
      </Field>
      <Field label="New password" htmlFor="newPassword" error={formState.errors.newPassword?.message} hint="At least 10 characters, with letters and numbers.">
        <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
      </Field>
      <Button type="submit" disabled={formState.isSubmitting} className="justify-self-start">
        {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />} Update password
      </Button>
    </form>
  );
}
