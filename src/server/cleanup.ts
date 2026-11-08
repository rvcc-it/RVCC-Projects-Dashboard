import "server-only";
import { sysQuery } from "@/lib/db";
import { getStorage } from "@/server/storage";

/**
 * Delete files from storage. Anything that cannot be removed right now stays in the
 * `storage_deletions` outbox and is retried by `drainStorageOutbox` (maintenance job).
 */
export async function deleteStoredFiles(keys: string[]) {
  const storage = getStorage();
  for (const key of keys) {
    try {
      await storage.delete(key);
      await sysQuery(`delete from "proj-dashboard-storage-deletions" where storage_key = $1`, [key]);
    } catch (e) {
      await sysQuery(
        `update "proj-dashboard-storage-deletions" set attempts = attempts + 1, last_error = $2 where storage_key = $1`,
        [key, (e as Error).message.slice(0, 300)],
      );
    }
  }
}

export async function drainStorageOutbox(limit = 200) {
  const { rows } = await sysQuery<{ storage_key: string }>(`select storage_key from "proj-dashboard-storage-deletions" order by created_at limit $1`, [limit]);
  await deleteStoredFiles(rows.map((r) => r.storage_key));
  const left = await sysQuery<{ n: number }>(`select count(*)::int as n from "proj-dashboard-storage-deletions"`);
  return { attempted: rows.length, remaining: left.rows[0].n };
}
