export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};
// colour tokens used for charts (consistent across the UI)
export const STATUS_COLOR: Record<ProjectStatus, string> = {
  planning: "#6366f1",
  active: "#0ea5e9",
  on_hold: "#f59e0b",
  completed: "#10b981",
  cancelled: "#94a3b8",
};
export const STATUS_BADGE: Record<ProjectStatus, string> = {
  planning: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  active: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  on_hold: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  cancelled: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

export const MEMBER_ROLES = ["manager", "engineer", "member", "viewer"] as const;
export const MEMBER_ROLE_LABEL: Record<string, string> = {
  manager: "Project Manager",
  engineer: "Engineer",
  member: "Team Member",
  viewer: "Viewer",
};

export const CHART_COLORS = ["#0ea5e9", "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#64748b", "#ec4899"];

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_COVER_BYTES = 3 * 1024 * 1024;
