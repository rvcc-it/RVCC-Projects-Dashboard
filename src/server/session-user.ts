import "server-only";
import { sysQuery } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { hasPerm, type PermissionCode } from "@/lib/permissions";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  jobTitle: string | null;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  mustChangePassword: boolean;
};

/** Loads the user, primary role and effective permission codes (system context). */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const { rows } = await sysQuery(
    `select u.id, u.email, u.full_name, u.department, u.job_title, coalesce(c.must_change_password,false) as must_change,
            r.id as role_id, r.code as role_code, r.name as role_name,
            case when r.code = 'super_admin'
                 then (select array_agg(code order by code) from "proj-dashboard-permissions")
                 else coalesce((select array_agg(p.code order by p.code) from "proj-dashboard-role-permissions" rp join "proj-dashboard-permissions" p on p.id = rp.permission_id where rp.role_id = r.id), '{}')
            end as perms
       from "proj-dashboard-users" u
       left join "proj-dashboard-user-credentials" c on c.user_id = u.id
       left join lateral (select r2.* from "proj-dashboard-user-roles" ur join "proj-dashboard-roles" r2 on r2.id = ur.role_id where ur.user_id = u.id order by r2.created_at limit 1) r on true
      where u.id = $1 and u.is_active`,
    [userId],
  );
  const r = rows[0];
  if (!r || !r.role_id) return null;
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    department: r.department,
    jobTitle: r.job_title,
    roleId: r.role_id,
    roleCode: r.role_code,
    roleName: r.role_name,
    permissions: r.perms ?? [],
    mustChangePassword: r.must_change,
  };
}

export function assertPerm(user: SessionUser, code: PermissionCode, message?: string) {
  if (!hasPerm(user, code)) throw new ForbiddenError(message);
}
