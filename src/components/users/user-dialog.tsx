"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Loader2, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { userCreateSchema, userUpdateSchema, type UserCreateInput, type UserUpdateInput } from "@/lib/validators";
import { createUserAction, updateUserAction } from "@/actions/users";
import type { UserListItem } from "@/server/services/users";

export type RoleOpt = { id: string; code: string; name: string };

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
          {done ? <Check /> : <Copy />} {done ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/** Shown after a password is generated/reset: the secret is displayed once and never stored in plain text. */
export function SecretDialog({ open, onOpenChange, title, description, label, value }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; label: string; value: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <CopyField label={label} value={value} />
        <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserDialog({ user, roles, open, onOpenChange, canGrantAdmin, isSelf }: { user?: UserListItem; roles: RoleOpt[]; open: boolean; onOpenChange: (o: boolean) => void; canGrantAdmin: boolean; isSelf?: boolean }) {
  const router = useRouter();
  const edit = !!user;
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const available = roles.filter((r) => r.code !== "super_admin" || canGrantAdmin || user?.roleCode === "super_admin");
  const defaults = {
    email: user?.email ?? "", username: user?.username ?? "", fullName: user?.fullName ?? "", department: user?.department ?? "", jobTitle: user?.jobTitle ?? "",
    phone: user?.phone ?? "", roleId: user?.roleId ?? available.find((r) => r.code === "viewer")?.id ?? "", password: "", isActive: user?.isActive ?? true,
  };
  type V = UserCreateInput & { isActive: boolean };
  const { register, control, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<V>({
    resolver: zodResolver(edit ? userUpdateSchema : userCreateSchema) as never,
    defaultValues: defaults,
  });
  useEffect(() => { if (open) reset(defaults); }, [open, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{edit ? `Edit ${user!.fullName}` : "Add user"}</DialogTitle>
            <DialogDescription>{edit ? "Update the profile, role or account status. Role changes sign the user out so new rights apply immediately." : "Create an account. The user must change the initial password at first sign-in."}</DialogDescription>
          </DialogHeader>
          <form
            id="user-form"
            className="grid gap-3 sm:grid-cols-2"
            noValidate
            onSubmit={handleSubmit(async (v) => {
              const r = edit ? await updateUserAction(user!.id, v as UserUpdateInput) : await createUserAction(v);
              if (!r.ok) {
                Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof V, { message: m }));
                return toast.error(r.error);
              }
              onOpenChange(false);
              router.refresh();
              if (!edit) {
                const d = r.data as { tempPassword: string | null; emailSent: boolean };
                toast.success(d.emailSent ? "User created and e-mail sent" : "User created");
                if (d.tempPassword) setSecret({ email: v.email, password: d.tempPassword });
              } else toast.success("User updated");
            })}
          >
            <Field label="Full name" htmlFor="fullName" required error={errors.fullName?.message} className="sm:col-span-2"><Input id="fullName" {...register("fullName")} /></Field>
            <Field label="E-mail" htmlFor="email" required error={errors.email?.message}><Input id="email" type="email" autoComplete="off" {...register("email")} /></Field>
            <Field label="Username" htmlFor="username" error={errors.username?.message} hint="Optional alternative login"><Input id="username" autoComplete="off" {...register("username")} /></Field>
            <Field label="Department" htmlFor="department" error={errors.department?.message}><Input id="department" {...register("department")} /></Field>
            <Field label="Job title" htmlFor="jobTitle" error={errors.jobTitle?.message}><Input id="jobTitle" {...register("jobTitle")} /></Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone?.message}><Input id="phone" {...register("phone")} /></Field>
            <Field label="Role" htmlFor="roleId" required error={errors.roleId?.message} hint={isSelf ? "You cannot change your own role." : undefined}>
              <NativeSelect id="roleId" {...register("roleId")} disabled={isSelf}>
                {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </NativeSelect>
            </Field>
            {!edit && (
              <Field label="Initial password" htmlFor="password" error={errors.password?.message} hint="Leave empty to generate a secure temporary password" className="sm:col-span-2">
                <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
              </Field>
            )}
            {edit && (
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
                    <span><span className="block text-sm font-medium">Account active</span><span className="block text-xs text-muted-foreground">Inactive users cannot sign in; their history is kept.</span></span>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSelf} aria-label="Account active" />
                  </label>
                )}
              />
            )}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" form="user-form" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : edit ? <Save /> : <UserPlus />} {edit ? "Save changes" : "Create user"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SecretDialog
        open={!!secret}
        onOpenChange={(o) => !o && setSecret(null)}
        title="Temporary password"
        description={`Share this password with ${secret?.email} through a secure channel. It is shown only once; the user must change it at first sign-in.`}
        label="Temporary password"
        value={secret?.password ?? ""}
      />
    </>
  );
}

