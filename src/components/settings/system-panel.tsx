"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Eraser, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form-field";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { updateSettingsAction } from "@/actions/settings";
import { purgeExpiredTrashAction } from "@/actions/documents";
import { restoreProjectAction } from "@/actions/projects";
import { formatDate } from "@/lib/format";
import { useRunAction } from "@/hooks/use-run-action";

type Values = { retentionDays: number; maxUploadMb: number };

export function SystemPanel({ settings, deletedProjects, canRestoreProjects }: { settings: Values; deletedProjects: { id: string; code: string; name: string; deletedAt: string }[]; canRestoreProjects: boolean }) {
  const router = useRouter();
  const { run, pending } = useRunAction();
  const [purge, setPurge] = useState(false);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({ defaultValues: settings });
  return (
    <div className="grid gap-5">
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold">Document policy</h2>
        <p className="mb-4 text-xs text-muted-foreground">Applies company-wide to every project.</p>
        <form
          className="grid max-w-xl gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            const r = await updateSettingsAction({ retentionDays: Number(v.retentionDays), maxUploadMb: Number(v.maxUploadMb) });
            if (!r.ok) {
              Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
              return toast.error(r.error);
            }
            toast.success("Settings saved");
            reset(v);
            router.refresh();
          })}
        >
          <Field label="Trash retention (days)" htmlFor="retentionDays" error={errors.retentionDays?.message} hint="Deleted documents are erased (records and files) after this period.">
            <Input id="retentionDays" type="number" min={1} max={3650} {...register("retentionDays", { valueAsNumber: true })} />
          </Field>
          <Field label="Maximum PDF size (MB)" htmlFor="maxUploadMb" error={errors.maxUploadMb?.message} hint="Enforced on the server for every upload.">
            <Input id="maxUploadMb" type="number" min={1} max={200} {...register("maxUploadMb", { valueAsNumber: true })} />
          </Field>
          <div className="sm:col-span-2"><Button type="submit" disabled={isSubmitting || !isDirty}>{isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} Save settings</Button></div>
        </form>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold">Retention job</h2>
        <p className="mb-4 max-w-2xl text-xs text-muted-foreground">Expired trash is purged automatically by the scheduled job (<code>POST /api/maintenance/purge</code>). You can also run it now. Files that could not be removed are retried each run, so storage never keeps orphaned files.</p>
        <Button variant="outline" onClick={() => setPurge(true)}><Eraser /> Purge expired trash now</Button>
      </section>

      {canRestoreProjects && (
        <section className="rounded-xl border bg-card shadow-card">
          <div className="border-b p-4"><h2 className="text-sm font-semibold">Deleted projects</h2><p className="text-xs text-muted-foreground">Soft-deleted projects can be restored here.</p></div>
          {deletedProjects.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No deleted projects.</p> : (
            <ul className="divide-y">
              {deletedProjects.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.code} · deleted {formatDate(p.deletedAt)}</div></div>
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => restoreProjectAction(p.id), { success: "Project restored" })}><RotateCcw /> Restore</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDialog
        open={purge}
        onOpenChange={setPurge}
        title="Purge expired trash?"
        description={<>Documents deleted more than <b>{settings.retentionDays} days</b> ago will be permanently erased together with all their revisions and files.</>}
        confirmLabel="Purge now"
        successMessage="Retention job completed"
        onConfirm={async () => {
          const r = await purgeExpiredTrashAction();
          if (r.ok) toast.info(`${r.data.purgedDocuments} document(s) purged · ${r.data.outboxRemaining} file(s) pending retry`);
          return r;
        }}
      />
    </div>
  );
}
