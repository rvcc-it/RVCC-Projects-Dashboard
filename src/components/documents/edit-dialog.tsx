"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { documentMetaSchema } from "@/lib/validators";
import { updateDocumentAction } from "@/actions/documents";
import type { CategoryOpt, ProjectOpt } from "@/components/documents/upload-dialog";

const schema = documentMetaSchema.extend({ projectId: z.uuid("Select a project") });
type Values = z.infer<typeof schema>;

export type EditableDoc = { id: string; title: string; description: string | null; categoryId: string; projectId: string; revisionLabel: string; documentDate: string | null };

export function EditDocumentDialog({ doc, projects, categories, open, onOpenChange }: { doc: EditableDoc; projects: ProjectOpt[]; categories: CategoryOpt[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const defaults: Values = { title: doc.title, description: doc.description ?? "", categoryId: doc.categoryId, projectId: doc.projectId, revisionLabel: doc.revisionLabel, documentDate: doc.documentDate ?? "" };
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const targets = projects.filter((p) => p.canUpload || p.id === doc.projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit document details</DialogTitle>
          <DialogDescription>Update metadata, change the category or move the document to another project. Files and revisions are not modified.</DialogDescription>
        </DialogHeader>
        <form
          id="edit-doc"
          className="grid gap-3"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            const r = await updateDocumentAction(doc.id, v);
            if (!r.ok) {
              Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
              return toast.error(r.error);
            }
            toast.success(r.data.changed.length ? "Document updated" : "No changes to save");
            onOpenChange(false);
            router.refresh();
          })}
        >
          <Field label="Title" htmlFor="title" required error={errors.title?.message}><Input id="title" {...register("title")} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" htmlFor="categoryId" error={errors.categoryId?.message}>
              <NativeSelect id="categoryId" {...register("categoryId")}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
            </Field>
            <Field label="Project" htmlFor="projectId" error={errors.projectId?.message}>
              <NativeSelect id="projectId" {...register("projectId")}>{targets.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}</NativeSelect>
            </Field>
            <Field label="Current revision label" htmlFor="revisionLabel" error={errors.revisionLabel?.message}><Input id="revisionLabel" {...register("revisionLabel")} /></Field>
            <Field label="Document date" htmlFor="documentDate" error={errors.documentDate?.message}><Input id="documentDate" type="date" {...register("documentDate")} /></Field>
          </div>
          <Field label="Description" htmlFor="description" error={errors.description?.message}><Textarea id="description" rows={3} {...register("description")} /></Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="edit-doc" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
