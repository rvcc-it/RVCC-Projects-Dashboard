import { cn } from "@/lib/utils";

/** Company mark. Replace with the official logo asset by swapping this component's SVG. */
export function Logo({ className, withText = true, textClassName }: { className?: string; withText?: boolean; textClassName?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 40 40" className="size-9 shrink-0" aria-hidden="true">
        <rect width="40" height="40" rx="10" fill="oklch(0.62 0.17 255)" />
        <path d="M9 31V17.5L20 9l11 8.5V31" fill="none" stroke="white" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M15 31v-8h10v8M15 17.5h10" fill="none" stroke="white" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {withText && (
        <div className={cn("leading-tight", textClassName)}>
          <div className="text-[15px] font-semibold tracking-tight">RVCC</div>
          <div className="text-[11px] opacity-70">Projects Portal</div>
        </div>
      )}
    </div>
  );
}
