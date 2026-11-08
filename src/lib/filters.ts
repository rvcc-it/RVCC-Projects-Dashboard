// Project slicer model shared by the browser (URL <-> state) and the server (SQL).
export type ArchiveMode = "exclude" | "include" | "only";

export type ProjectFilters = {
  q: string;
  names: string[];
  codes: string[];
  locations: string[];
  managers: string[]; // user ids
  clients: string[];
  statuses: string[];
  categories: string[];
  startFrom: string;
  startTo: string;
  endFrom: string;
  endTo: string;
  archived: ArchiveMode;
};

export const emptyFilters: ProjectFilters = {
  q: "", names: [], codes: [], locations: [], managers: [], clients: [], statuses: [], categories: [],
  startFrom: "", startTo: "", endFrom: "", endTo: "", archived: "exclude",
};

type SP = Record<string, string | string[] | undefined> | URLSearchParams;

function get(sp: SP, k: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(k).filter(Boolean);
  const v = sp[k];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}
const one = (sp: SP, k: string) => get(sp, k)[0] ?? "";
const dateOk = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");

export function parseFilters(sp: SP): ProjectFilters {
  const arch = one(sp, "archived");
  return {
    q: one(sp, "q").slice(0, 120),
    names: get(sp, "name"),
    codes: get(sp, "code"),
    locations: get(sp, "loc"),
    managers: get(sp, "pm"),
    clients: get(sp, "client"),
    statuses: get(sp, "status"),
    categories: get(sp, "cat"),
    startFrom: dateOk(one(sp, "sf")),
    startTo: dateOk(one(sp, "st")),
    endFrom: dateOk(one(sp, "ef")),
    endTo: dateOk(one(sp, "et")),
    archived: arch === "include" || arch === "only" ? arch : "exclude",
  };
}

export function filtersToParams(f: ProjectFilters, into?: URLSearchParams): URLSearchParams {
  const p = into ?? new URLSearchParams();
  const KEYS = ["q", "name", "code", "loc", "pm", "client", "status", "cat", "sf", "st", "ef", "et", "archived"];
  KEYS.forEach((k) => p.delete(k));
  if (f.q) p.set("q", f.q);
  f.names.forEach((v) => p.append("name", v));
  f.codes.forEach((v) => p.append("code", v));
  f.locations.forEach((v) => p.append("loc", v));
  f.managers.forEach((v) => p.append("pm", v));
  f.clients.forEach((v) => p.append("client", v));
  f.statuses.forEach((v) => p.append("status", v));
  f.categories.forEach((v) => p.append("cat", v));
  if (f.startFrom) p.set("sf", f.startFrom);
  if (f.startTo) p.set("st", f.startTo);
  if (f.endFrom) p.set("ef", f.endFrom);
  if (f.endTo) p.set("et", f.endTo);
  if (f.archived !== "exclude") p.set("archived", f.archived);
  return p;
}

export function activeFilterCount(f: ProjectFilters) {
  return (
    (f.q ? 1 : 0) + f.names.length + f.codes.length + f.locations.length + f.managers.length + f.clients.length +
    f.statuses.length + f.categories.length + (f.startFrom || f.startTo ? 1 : 0) + (f.endFrom || f.endTo ? 1 : 0)
  );
}

const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

/**
 * Build a parameterised WHERE clause (no string interpolation of user input).
 * Expects: projects aliased `p`, manager user aliased `pm` (left join).
 */
export function buildProjectWhere(f: ProjectFilters, startIdx = 1) {
  const params: unknown[] = [];
  const w: string[] = ["p.deleted_at is null"];
  const add = (v: unknown) => {
    params.push(v);
    return "$" + (startIdx + params.length - 1);
  };
  if (f.archived === "exclude") w.push("p.is_archived = false");
  if (f.archived === "only") w.push("p.is_archived = true");
  if (f.q) {
    const t = add("%" + escLike(f.q) + "%");
    w.push(`(p.name ilike ${t} or p.code ilike ${t} or p.location ilike ${t} or p.client_name ilike ${t} or pm.full_name ilike ${t})`);
  }
  if (f.names.length) w.push(`p.name = any(${add(f.names)}::text[])`);
  if (f.codes.length) w.push(`p.code = any(${add(f.codes)}::text[])`);
  if (f.locations.length) w.push(`p.location = any(${add(f.locations)}::text[])`);
  if (f.managers.length) w.push(`p.project_manager_id = any(${add(f.managers)}::uuid[])`);
  if (f.clients.length) w.push(`p.client_name = any(${add(f.clients)}::text[])`);
  if (f.statuses.length) w.push(`p.status = any(${add(f.statuses)}::text[])`);
  if (f.categories.length) w.push(`p.category = any(${add(f.categories)}::text[])`);
  if (f.startFrom) w.push(`p.start_date >= ${add(f.startFrom)}::date`);
  if (f.startTo) w.push(`p.start_date <= ${add(f.startTo)}::date`);
  if (f.endFrom) w.push(`p.expected_completion >= ${add(f.endFrom)}::date`);
  if (f.endTo) w.push(`p.expected_completion <= ${add(f.endTo)}::date`);
  return { where: w.join(" and "), params };
}
