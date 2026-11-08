// Helpers for reading list-page URL params (page, size, sort, dir).
export type SP = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function listParams(sp: SP, defaultSort: string) {
  const page = Math.max(1, parseInt(first(sp.page), 10) || 1);
  const size = [10, 25, 50].includes(parseInt(first(sp.size), 10)) ? parseInt(first(sp.size), 10) : 10;
  const sort = first(sp.sort) || defaultSort;
  const dir = first(sp.dir) === "asc" ? ("asc" as const) : ("desc" as const);
  return { page, pageSize: size, sort, dir };
}
export const str = first;
