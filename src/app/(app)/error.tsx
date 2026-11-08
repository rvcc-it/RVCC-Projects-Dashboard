"use client";
import { useEffect } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertOctagon className="size-7" />
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">We could not load this page. Your data is safe. Try again, and if the problem continues contact your administrator{error.digest ? ` (ref ${error.digest})` : ""}.</p>
      <Button onClick={reset}>
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
