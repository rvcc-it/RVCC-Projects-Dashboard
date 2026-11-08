"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MoreHorizontal, Pencil, Plus, Save, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { categorySchema, type CategoryInput } from "@/lib/validators";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/actions/categories";
import type { Category } from "@/server/services/categories";

function CategoryDialog({ category, open, onOpenChange }: { category?: Category; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const defaults: CategoryInput = { name: category?.name ?? "", description: category?.description ?? "", sortOrder: category?.sortOrder ?? 100, isActive: category?.isActive ?? true };
  const { register, control, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<CategoryInput>({ resolver: zodResolver(categorySchema), defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, category?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle><DialogDescription>Categories organise documents and appear in upload forms and filters.</DialogDescription></DialogHeader>
        <form
          id="cat-form"
          className="grid gap-3"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            const r = category ? await updateCategoryAction(category.id, v) : await createCategoryAction(v);
            if (!r.ok) {
              Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof CategoryInput, { message: m }));
              return toast.error(r.error);
            }
            toast.success(category ? "Category updated" : "Category created");
            onOpenChange(false);
            router.refresh();
          })}
        >
          <Field label="Name" htmlFor="name" required error={errors.name?.message}><Input id="name" {...register("name")} /></Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message}><Input id="description" {...register("description")} /></Field>
          <Field label="Sort order" htmlFor="sortOrder" error={errors.sortOrder?.message} hint="Lower numbers appear first"><Input id="sortOrder" type="number" {...register("sortOrder", { valueAsNumber: true })} /></Field>
          <Controller control={control} name="isActive" render={({ field }) => (
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>Active<span className="block text-xs text-muted-foreground">Inactive categories cannot be chosen for new uploads.</span></span><Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Active" /></label>
          )} />
        </form>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="cat-form" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesManager({ categories }: { categories: Category[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [target, setTarget] = useState("");
  const others = categories.filter((c) => c.id !== deleting?.id && c.isActive);
  const needsTarget = (deleting?.docCount ?? 0) > 0;

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="flex items-center justify-between border-b p-4">
        <div><h2 className="text-sm font-semibold">Document categories</h2><p className="text-xs text-muted-foreground">Configure how documents are classified.</p></div>
        <Button onClick={() => setCreating(true)}><Plus /> Add category</Button>
      </div>
      {categories.length === 0 ? <EmptyState icon={Tags} title="No categories" /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead className="text-center">Order</TableHead><TableHead className="text-center">Documents</TableHead><TableHead>Status</TableHead><TableHead className="w-10"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">{c.description ?? "—"}</TableCell>
                  <TableCell className="text-center tabular-nums">{c.sortOrder}</TableCell>
                  <TableCell className="text-center tabular-nums">{c.docCount}</TableCell>
                  <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-slate-500/10 text-slate-600 dark:text-slate-300"}`}>{c.isActive ? "Active" : "Inactive"}</span></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setEditing(c)}><Pencil /> Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => { setTarget(""); setDeleting(c); }}><Trash2 /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <CategoryDialog open={creating} onOpenChange={setCreating} />
      {editing && <CategoryDialog category={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete category?"
        description={
          needsTarget ? (
            <div className="grid gap-2">
              <p><b>{deleting?.name}</b> is used by {deleting?.docCount} document(s). Choose a category to move them to — or cancel and deactivate it instead.</p>
              <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Reassign documents to"><option value="">Select a category…</option>{others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
            </div>
          ) : (<><b>{deleting?.name}</b> is not used by any document and will be deleted.</>)
        }
        confirmLabel={needsTarget ? "Reassign & delete" : "Delete"}
        successMessage="Category deleted"
        onConfirm={async () => (needsTarget && !target ? { ok: false as const, error: "Select a category to reassign the documents to." } : deleteCategoryAction(deleting!.id, needsTarget ? target : undefined))}
      />
    </section>
  );
}
