import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { CategoriesManager } from "@/components/settings/categories-manager";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { SystemPanel } from "@/components/settings/system-panel";
import { requirePageUser } from "@/server/auth";
import { listCategories } from "@/server/services/categories";
import { getSettings } from "@/server/services/settings";
import { listDeletedProjects } from "@/server/services/projects";
import { getUser } from "@/server/services/users";
import { PERMS, hasPerm } from "@/lib/permissions";
import { str, type SP } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tabs = [
    { id: "profile", label: "Profile", show: true },
    { id: "security", label: "Security", show: true },
    { id: "categories", label: "Document categories", show: hasPerm(user, PERMS.categoryManage) },
    { id: "system", label: "System & retention", show: hasPerm(user, PERMS.settingsManage) },
  ].filter((t) => t.show);
  const tab = tabs.find((t) => t.id === str(sp.tab))?.id ?? "profile";
  const me = tab === "profile" ? await getUser(user, user.id) : null;

  return (
    <>
      <PageHeader title="Settings" description="Your account and, for administrators, system configuration." />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 shadow-card sm:inline-flex" role="tablist">
        {tabs.map((t) => (
          <Link key={t.id} href={t.id === "profile" ? "/settings" : `/settings?tab=${t.id}`} role="tab" aria-selected={tab === t.id} className={cn("rounded-md px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors", tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{t.label}</Link>
        ))}
      </div>

      {tab === "profile" && me && (
        <section className="max-w-3xl rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-4 text-sm font-semibold">Profile</h2>
          <ProfileForm defaults={{ fullName: me.fullName, department: me.department ?? "", jobTitle: me.jobTitle ?? "", phone: me.phone ?? "" }} email={user.email} roleName={user.roleName} />
        </section>
      )}
      {tab === "security" && (
        <section className="max-w-md rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-1 text-sm font-semibold">Change password</h2>
          <p className="mb-4 text-xs text-muted-foreground">Changing your password signs you out of all other devices.</p>
          <ChangePasswordForm />
        </section>
      )}
      {tab === "categories" && <CategoriesManager categories={await listCategories(user)} />}
      {tab === "system" && <SystemPanel settings={await getSettings(user)} deletedProjects={hasPerm(user, PERMS.projectDelete) ? await listDeletedProjects(user) : []} canRestoreProjects={hasPerm(user, PERMS.projectDelete)} />}
    </>
  );
}
