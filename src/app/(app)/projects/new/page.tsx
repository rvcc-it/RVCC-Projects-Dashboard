import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { requirePageUser } from "@/server/auth";
import { listProjectCategories } from "@/server/services/projects";
import { listAllActiveUsers } from "@/server/services/users";
import { PERMS, hasPerm } from "@/lib/permissions";
import { ForbiddenNotice } from "@/components/common/forbidden-notice";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const user = await requirePageUser();
  if (!hasPerm(user, PERMS.projectCreate)) return <ForbiddenNotice message="You do not have permission to create projects." />;
  const [users, categories] = await Promise.all([listAllActiveUsers(user), listProjectCategories(user)]);
  return (
    <>
      <PageHeader title="New project" description="Fill in the project details. A unique project code is generated automatically if you leave it blank." />
      <ProjectForm
        users={users.map((u) => ({ id: u.id, name: u.name, roleCode: u.roleCode, department: u.department }))}
        categories={categories}
        canAssignManager={hasPerm(user, PERMS.projectAssignManager)}
        canViewContract={hasPerm(user, PERMS.projectViewContractValue)}
        canEditContract={hasPerm(user, PERMS.projectEditContractValue)}
      />
    </>
  );
}
