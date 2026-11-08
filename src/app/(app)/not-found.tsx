import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-7" />
      </div>
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="text-sm text-muted-foreground">This record does not exist, or you do not have access to it.</p>
      <Link href="/"><Button variant="outline">Back to overview</Button></Link>
    </div>
  );
}
