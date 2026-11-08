// Permission codes are stored in the database (permissions table). This file only gives them types.
export const PERMS = {
  projectViewAll: "project.view_all",
  projectCreate: "project.create",
  projectUpdateAll: "project.update_all",
  projectUpdateAssigned: "project.update_assigned",
  projectDelete: "project.delete",
  projectAssignManager: "project.assign_manager",
  projectManageTeamAll: "project.manage_team_all",
  projectManageTeamAssigned: "project.manage_team_assigned",
  projectViewContractValue: "project.view_contract_value",
  projectEditContractValue: "project.edit_contract_value",
  documentUploadAll: "document.upload_all",
  documentUploadAssigned: "document.upload_assigned",
  documentDeleteAll: "document.delete_all",
  documentDeleteAssigned: "document.delete_assigned",
  documentDownload: "document.download",
  categoryManage: "category.manage",
  userView: "user.view",
  userManage: "user.manage",
  roleManage: "role.manage",
  settingsManage: "settings.manage",
  auditView: "audit.view",
  reportView: "report.view",
  reportExport: "report.export",
  filterSave: "filter.save",
} as const;
export type PermissionCode = (typeof PERMS)[keyof typeof PERMS];

export type PermissionHolder = { permissions: string[] };
export const hasPerm = (u: PermissionHolder | null | undefined, code: PermissionCode) => !!u && u.permissions.includes(code);
export const hasAnyPerm = (u: PermissionHolder | null | undefined, ...codes: PermissionCode[]) => codes.some((c) => hasPerm(u, c));
