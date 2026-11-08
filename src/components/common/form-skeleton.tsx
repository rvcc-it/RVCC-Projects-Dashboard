import { Skeleton } from "@/components/ui/skeleton";

export function FormSkeleton({ blocks = 3 }: { blocks?: number }) {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading form">
      {Array.from({ length: blocks }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5 shadow-card">
          <Skeleton className="mb-4 h-4 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </div>
      ))}
    </div>
  );
}
