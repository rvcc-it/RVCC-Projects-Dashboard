"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";

/** Confirmation for destructive operations. Optionally requires typing a phrase (e.g. the project code). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  requireText,
  successMessage,
  onConfirm,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireText?: string;
  successMessage?: string;
  onConfirm: () => Promise<ActionResult<unknown>>;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const blocked = !!requireText && typed.trim() !== requireText;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) {
          onOpenChange(o);
          if (!o) setTyped("");
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireText && (
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">
              Type <b className="font-mono text-foreground">{requireText}</b> to confirm.
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Confirmation text" />
          </div>
        )}
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || blocked}
            onClick={() =>
              start(async () => {
                const r = await onConfirm();
                if (r.ok) {
                  toast.success(successMessage ?? "Done");
                  onOpenChange(false);
                  setTyped("");
                  onSuccess?.();
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
