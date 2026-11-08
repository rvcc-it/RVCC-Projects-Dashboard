import { Building2, FileText, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-sky-500/10 blur-3xl" />
        <Logo textClassName="text-white" />
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white">One place for every project, drawing and approval.</h2>
          <p className="mt-3 text-sm text-sidebar-foreground/80">Track delivery across sites, keep every document and revision under control, and give each team exactly the access it needs.</p>
          <ul className="mt-8 grid gap-4 text-sm">
            {[
              [Building2, "Portfolio dashboard with live project slicers"],
              [FileText, "Private PDF library with full revision history"],
              [ShieldCheck, "Role-based access enforced down to the database"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Building2;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white/10"><I className="size-4" /></span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-foreground/60">© {new Date().getFullYear()} RVCC. Authorised users only.</p>
      </aside>
      <main className="flex items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
