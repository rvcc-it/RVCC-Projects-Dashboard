"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form-field";
import { profileSchema, type ProfileInput } from "@/lib/validators";
import { updateProfileAction } from "@/actions/users";
import { useHydrated } from "@/hooks/use-hydrated";
import { FormSkeleton } from "@/components/common/form-skeleton";

export function ProfileForm({ defaults, email, roleName }: { defaults: ProfileInput; email: string; roleName: string }) {
  const router = useRouter();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty }, reset } = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const hydrated = useHydrated();
  if (!hydrated) return <FormSkeleton blocks={1} />;
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        const r = await updateProfileAction(v);
        if (!r.ok) {
          Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof ProfileInput, { message: m }));
          return toast.error(r.error);
        }
        toast.success("Profile updated");
        reset(v);
        router.refresh();
      })}
    >
      <Field label="E-mail" hint="Contact an administrator to change your e-mail."><Input value={email} readOnly disabled /></Field>
      <Field label="Role" hint="Assigned by an administrator."><Input value={roleName} readOnly disabled /></Field>
      <Field label="Full name" htmlFor="fullName" required error={errors.fullName?.message}><Input id="fullName" {...register("fullName")} /></Field>
      <Field label="Phone" htmlFor="phone" error={errors.phone?.message}><Input id="phone" {...register("phone")} /></Field>
      <Field label="Department" htmlFor="department" error={errors.department?.message}><Input id="department" {...register("department")} /></Field>
      <Field label="Job title" htmlFor="jobTitle" error={errors.jobTitle?.message}><Input id="jobTitle" {...register("jobTitle")} /></Field>
      <div className="sm:col-span-2"><Button type="submit" disabled={isSubmitting || !isDirty}>{isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} Save profile</Button></div>
    </form>
  );
}
