import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenNotice } from "@/components/common/forbidden-notice";
import { ProjectForm } from "@/components/projects/project-form";
import { requirePageUser } from "@/server/auth";
import { getProject, listProjectCategories } from "@/server/services/projects";
import { listAllActiveUsers } from "@/server/services/users";
import { NotFoundError } from "@/lib/errors";
import { PERMS, hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser();
  const project = await getProject(user, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (!project.caps.edit) return <ForbiddenNotice message="You do not have permission to edit this project." />;
  const [users, categories] = await Promise.all([listAllActiveUsers(user), listProjectCategories(user)]);
  return (
    <>
      <PageHeader title={`Edit ${project.code}`} description={project.name} />
      <ProjectForm
        project={project}
        users={users.map((u) => ({ id: u.id, name: u.name, roleCode: u.roleCode, department: u.department }))}
        categories={categories}
        canAssignManager={hasPerm(user, PERMS.projectAssignManager)}
        canViewContract={hasPerm(user, PERMS.projectViewContractValue)}
        canEditContract={hasPerm(user, PERMS.projectEditContractValue)}
      />
    </>
  );
}
