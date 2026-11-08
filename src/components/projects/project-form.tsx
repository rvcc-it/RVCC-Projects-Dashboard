"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { MAX_COVER_BYTES, PROJECT_STATUSES, STATUS_LABEL } from "@/lib/constants";
import { projectSchema, type ProjectInput } from "@/lib/validators";
import { createProjectAction, updateProjectAction } from "@/actions/projects";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";
import { FormSkeleton } from "@/components/common/form-skeleton";
import type { ProjectDetail } from "@/server/services/projects";

export type UserOption = { id: string; name: string; roleCode: string | null; department: string | null };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mb-4 text-xs text-muted-foreground">{description}</p>}
      <div className={cn("grid gap-4 sm:grid-cols-2", !description && "mt-4")}>{children}</div>
    </section>
  );
}

export function ProjectForm({
  project, users, categories, canAssignManager, canViewContract, canEditContract,
}: { project?: ProjectDetail; users: UserOption[]; categories: string[]; canAssignManager: boolean; canViewContract: boolean; canEditContract: boolean }) {
  const router = useRouter();
  const edit = !!project;
  const fileRef = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(project?.hasCover ? `/api/projects/${project.id}/cover` : null);

  const form = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      code: project?.code ?? "", name: project?.name ?? "", clientName: project?.clientName ?? "", mainContractor: project?.mainContractor ?? "",
      consultant: project?.consultant ?? "", location: project?.location ?? "", description: project?.description ?? "",
      category: project?.category ?? categories[0] ?? "", projectManagerId: project?.managerId ?? "", memberIds: [],
      startDate: project?.startDate ?? "", expectedCompletion: project?.expectedCompletion ?? "", actualCompletion: project?.actualCompletion ?? "",
      status: (project?.status as ProjectInput["status"]) ?? "planning", progress: project?.progress ?? 0,
      contractValue: project?.contractValue ? String(Number(project.contractValue)) : "", remarks: project?.remarks ?? "",
    },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, control, watch } = form;
  const status = watch("status");
  const hydrated = useHydrated();

  function pickCover(f: File | null) {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast.error("Cover must be a PNG, JPEG or WebP image.");
    if (f.size > MAX_COVER_BYTES) return toast.error("Cover image must be 3 MB or smaller.");
    setCover(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(values: ProjectInput) {
    const r = edit ? await updateProjectAction(project!.id, values) : await createProjectAction(values);
    if (!r.ok) {
      Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof ProjectInput, { message: m }));
      toast.error(r.error);
      return;
    }
    const id = (r.data as { id: string }).id;
    if (cover) {
      const fd = new FormData();
      fd.append("file", cover);
      const up = await fetch(`/api/projects/${id}/cover`, { method: "POST", body: fd });
      if (!up.ok) toast.error((await up.json().catch(() => ({}))).error ?? "Project saved, but the cover image could not be uploaded.");
    }
    toast.success(edit ? "Project updated" : "Project created");
    router.push(`/projects/${id}`);
    router.refresh();
  }

  if (!hydrated) return <FormSkeleton blocks={4} />;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <Section title="Project identity">
        <Field label="Project code" htmlFor="code" error={errors.code?.message} hint={edit ? undefined : "Leave blank to auto-generate (PRJ-YYYY-0001)"}>
          <Input id="code" placeholder="Auto-generated" {...register("code")} aria-invalid={!!errors.code} />
        </Field>
        <Field label="Project name" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Client name" htmlFor="clientName" required error={errors.clientName?.message}>
          <Input id="clientName" {...register("clientName")} aria-invalid={!!errors.clientName} />
        </Field>
        <Field label="Location" htmlFor="location" required error={errors.location?.message}>
          <Input id="location" placeholder="e.g. Riyadh" {...register("location")} aria-invalid={!!errors.location} />
        </Field>
        <Field label="Main contractor" htmlFor="mainContractor" error={errors.mainContractor?.message}>
          <Input id="mainContractor" {...register("mainContractor")} />
        </Field>
        <Field label="Consultant" htmlFor="consultant" error={errors.consultant?.message}>
          <Input id="consultant" {...register("consultant")} />
        </Field>
        <Field label="Category / discipline" htmlFor="category" required error={errors.category?.message}>
          <NativeSelect id="category" {...register("category")}>
            {[...new Set([...(project ? [project.category] : []), ...categories])].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2" error={errors.description?.message}>
          <Textarea id="description" rows={3} {...register("description")} />
        </Field>
      </Section>

      <Section title="Team" description={edit ? "Manage team members from the project's Team tab." : "Assign the project manager and initial team members."}>
        <Field label="Project manager" htmlFor="projectManagerId" error={errors.projectManagerId?.message} hint={canAssignManager ? undefined : "Only users with the assign-manager permission can change this."}>
          {canAssignManager ? (
            <NativeSelect id="projectManagerId" {...register("projectManagerId")}>
              <option value="">— Unassigned —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.department ? ` · ${u.department}` : ""}</option>)}
            </NativeSelect>
          ) : (
            <Input value={project?.managerName ?? "Unassigned"} readOnly disabled />
          )}
        </Field>
        {!edit && (
          <Field label="Initial team members" htmlFor="memberIds" error={errors.memberIds?.message as string | undefined}>
            <Controller
              control={control}
              name="memberIds"
              render={({ field }) => (
                <div className="max-h-40 overflow-y-auto rounded-lg border p-1" role="group" aria-label="Initial team members">
                  {users.map((u) => {
                    const on = field.value.includes(u.id);
                    return (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
                        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={on} onChange={() => field.onChange(on ? field.value.filter((x) => x !== u.id) : [...field.value, u.id])} />
                        <span className="truncate">{u.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{u.department}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
          </Field>
        )}
      </Section>

      <Section title="Schedule & status">
        <Field label="Start date" htmlFor="startDate" error={errors.startDate?.message}>
          <Input id="startDate" type="date" {...register("startDate")} />
        </Field>
        <Field label="Expected completion" htmlFor="expectedCompletion" error={errors.expectedCompletion?.message}>
          <Input id="expectedCompletion" type="date" {...register("expectedCompletion")} />
        </Field>
        <Field label="Actual completion" htmlFor="actualCompletion" error={errors.actualCompletion?.message} hint="Set automatically when a project is marked completed.">
          <Input id="actualCompletion" type="date" {...register("actualCompletion")} />
        </Field>
        <Field label="Status" htmlFor="status" required error={errors.status?.message}>
          <NativeSelect id="status" {...register("status")}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Overall progress (%)" htmlFor="progress" error={errors.progress?.message} hint={status === "completed" ? "Completed projects are set to 100%." : undefined}>
          <Input id="progress" type="number" min={0} max={100} step={1} {...register("progress", { valueAsNumber: true })} aria-invalid={!!errors.progress} />
        </Field>
        {canViewContract && (
          <Field label="Contract value (SAR)" htmlFor="contractValue" error={errors.contractValue?.message} hint={canEditContract ? "Restricted – visible only to authorised users." : "Read only."}>
            <Input id="contractValue" inputMode="decimal" placeholder="0.00" {...register("contractValue")} readOnly={!canEditContract} disabled={!canEditContract} />
          </Field>
        )}
      </Section>

      <Section title="Cover image & remarks">
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-medium">Project cover</p>
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Project cover preview" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="size-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="cover" onChange={(e) => pickCover(e.target.files?.[0] ?? null)} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><ImagePlus /> Choose image</Button>
              {cover && <Button type="button" variant="ghost" size="sm" onClick={() => { setCover(null); setPreview(project?.hasCover ? `/api/projects/${project.id}/cover` : null); }}><X /> Discard</Button>}
              <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 3 MB.</p>
            </div>
          </div>
        </div>
        <Field label="Remarks" htmlFor="remarks" className="sm:col-span-2" error={errors.remarks?.message}>
          <Textarea id="remarks" rows={3} {...register("remarks")} />
        </Field>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link href={edit ? `/projects/${project!.id}` : "/projects"}><Button type="button" variant="outline">Cancel</Button></Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} {edit ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
