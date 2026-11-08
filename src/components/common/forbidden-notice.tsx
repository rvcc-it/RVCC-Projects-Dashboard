import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ForbiddenNotice({ message = "You do not have permission to view this page." }: { message?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
        <ShieldAlert className="size-7" />
      </div>
      <h2 className="text-lg font-semibold">Access restricted</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link href="/"><Button variant="outline">Back to overview</Button></Link>
    </div>
  );
}
