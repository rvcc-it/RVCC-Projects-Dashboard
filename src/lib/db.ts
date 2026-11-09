import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { AppError, ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";

// bigint -> number, date -> 'YYYY-MM-DD' string (no timezone shifts), timestamptz -> ISO string
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => new Date(v + "Z").toISOString());
types.setTypeParser(1184, (v) => new Date(v).toISOString());

declare global {
  var __rvccPool: Pool | undefined;
}

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    // Keep this small: Supabase poolers allow only ~15 connections in total, shared by every running copy of the app.
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 10_000, // give idle connections back quickly
  });
}
export const pool: Pool = (globalThis.__rvccPool ??= createPool());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Db {
  query<T extends QueryResultRow = Row>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

function wrap(client: PoolClient): Db {
  return {
    async query(text: string, params?: unknown[]) {
      const r = await client.query(text, params as unknown[]);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
  } as Db;
}

function constraintMessage(c?: string) {
  const map: Record<string, string> = {
    uq_projects_code: "A project with this code already exists.",
    uq_users_email: "A user with this e-mail already exists.",
    uq_users_username: "This username is already taken.",
    uq_doc_categories_name: "A category with this name already exists.",
    uq_saved_filters_name: "You already have a saved filter with this name.",
  };
  return c ? map[c] : undefined;
}

/** Node reports an unreachable server as an opaque AggregateError (one entry per IPv4/IPv6 attempt): make it readable. */
function explainConnectionError(e: unknown): AppError | null {
  const errs = e instanceof AggregateError ? (e.errors as { code?: string }[]) : [e as { code?: string }];
  const code = errs.map((x) => x?.code).find((c) => c && ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH"].includes(c));
  if (!code) return null;
  let target = "the database";
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    target = `${u.hostname}:${u.port || 5432}`;
  } catch {
    /* ignore */
  }
  console.error(`[db] Cannot reach PostgreSQL at ${target} (${code}). Is it running? Local dev: "npm run db:local". Otherwise check DATABASE_URL / network.`);
  return new AppError(`The database is unreachable (${target}). Please try again shortly or contact an administrator.`, 503, "db_unavailable");
}

/** Translate PostgreSQL errors into friendly application errors. */
export function mapDbError(e: unknown): unknown {
  if (e instanceof AppError) return e;
  const unreachable = explainConnectionError(e);
  if (unreachable) return unreachable;
  const err = e as { code?: string; message?: string; constraint?: string };
  switch (err?.code) {
    case "42501":
      return new ForbiddenError(
        err.message?.startsWith("Permission denied") ? err.message : "You do not have permission to perform this action.",
      );
    case "23505":
      return new ConflictError(constraintMessage(err.constraint) ?? "A record with the same unique value already exists.");
    case "23503":
      return new ConflictError("This record is still referenced by other records and cannot be changed or removed.");
    case "23514":
      return new ValidationError("A value is outside the allowed range (" + (err.constraint ?? "check constraint") + ").");
    case "23502":
      return new ValidationError("A required value is missing.");
    case "22P02":
    case "22007":
      return new ValidationError("A value has an invalid format.");
    default:
      return e;
  }
}

/**
 * Run `fn` inside a transaction as the authenticated app role with Row Level Security enforced.
 * Every business query MUST go through this function.
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect().catch((e) => {
    throw mapDbError(e);
  });
  try {
    await client.query("begin");
    await client.query("set local role app_authenticated");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(wrap(client));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw mapDbError(e);
  } finally {
    client.release();
  }
}

/** Trusted system context (owner role, no RLS). ONLY for authentication, sessions and maintenance. */
export async function sys<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect().catch((e) => {
    throw mapDbError(e);
  });
  try {
    await client.query("begin");
    const result = await fn(wrap(client));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw mapDbError(e);
  } finally {
    client.release();
  }
}

export async function sysQuery<T extends QueryResultRow = Row>(text: string, params?: unknown[]) {
  try {
    const r = await pool.query<T>(text, params as unknown[]);
    return { rows: r.rows, rowCount: r.rowCount ?? 0 };
  } catch (e) {
    throw mapDbError(e);
  }
}
