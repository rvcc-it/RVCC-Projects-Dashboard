import "../scripts/env";
import { sys, sysQuery, withUser, pool } from "../src/lib/db";
import { loadSessionUser, type SessionUser } from "../src/server/session-user";

export { sys, sysQuery, withUser, pool };

export async function userByEmail(email: string): Promise<SessionUser> {
  const r = await sysQuery(`select id from "proj-dashboard-users" where email = $1`, [email]);
  const u = await loadSessionUser(r.rows[0].id);
  if (!u) throw new Error("no user " + email);
  return u;
}

export const EMAIL = {
  admin: "admin@demo.rvcc.test",
  mgmt: "management@demo.rvcc.test",
  ahmed: "ahmed.pm@demo.rvcc.test",
  sara: "sara.pm@demo.rvcc.test",
  omar: "omar.pm@demo.rvcc.test",
  yousef: "yousef.eng@demo.rvcc.test",
  layla: "layla.eng@demo.rvcc.test",
  imran: "imran.eng@demo.rvcc.test",
  viewer: "viewer@demo.rvcc.test",
};

export function minimalPdf(label = "test"): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF ${label}`);
}

export function baseProject(over: Record<string, unknown> = {}) {
  return {
    code: "", name: "ZZ Test Project", clientName: "Test Client", mainContractor: "", consultant: "", location: "Riyadh", description: "",
    category: "Building Construction", projectManagerId: "", memberIds: [] as string[], startDate: "2026-01-01", expectedCompletion: "2026-12-31",
    actualCompletion: "", status: "active", progress: 10, contractValue: "", remarks: "", ...over,
  };
}
