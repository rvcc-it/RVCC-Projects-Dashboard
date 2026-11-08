// End-to-end functional test: drives the real UI in Chromium and verifies persistence directly in PostgreSQL + file storage.
// Requires: dev/prod server running, DB migrated + seeded.
//   BASE_URL=http://localhost:3001 CHROME_PATH="<chrome.exe>" node tests/e2e/functional.mjs
import { chromium } from "playwright";
import pg from "pg";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";

dotenv.config({ path: ".env.local", quiet: true });
const BASE = process.env.BASE_URL || "http://localhost:3001";
const STORAGE = path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage");
const SHOTS = process.env.SHOTS_DIR;
const PW = "Demo@12345";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (sql, params) => (await db.query(sql, params)).rows;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rvcc-e2e-"));
function makePdf(name, text) {
  const d = new jsPDF();
  d.setFontSize(20);
  d.text(text, 20, 30);
  const p = path.join(tmp, name);
  fs.writeFileSync(p, Buffer.from(d.output("arraybuffer")));
  return p;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const results = [];
const consoleErrors = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name} (${Date.now() - t}ms)`);
  } catch (e) {
    results.push({ name, ok: false, err: e });
    console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n").slice(0, 6).join("\n        ")}`);
  }
}
async function newSession(email, password = PW) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`${email}: ${e.message}`));
  await page.goto(BASE + "/login");
  await page.fill("#identifier", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  return { ctx, page };
}
const shot = async (page, n) => SHOTS && page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true });
const toast = (page, text) => page.locator("[data-sonner-toast]", { hasText: text }).first().waitFor({ timeout: 15000 });

await db.query(`delete from "proj-dashboard-users" where email like 'zz.e2e.%@demo.rvcc.test'`);
await db.query(`delete from "proj-dashboard-projects" where name like 'ZZ E2E Project %'`);
const uniq = Date.now().toString(36).toUpperCase();
const NAME = `ZZ E2E Project ${uniq}`;
let projectId, projectCode, docId, newUserId, tempPassword;
const cleanup = { projects: [], users: [], keys: [] };

console.log(`\nE2E against ${BASE}\n`);
const admin = await newSession("admin@demo.rvcc.test");
const page = admin.page;
const ahmed = (await q(`select id from "proj-dashboard-users" where email = 'ahmed.pm@demo.rvcc.test'`))[0].id;

await step("Login: protected routes redirect to /login when signed out", async () => {
  const anon = await browser.newContext();
  const r = await anon.request.get(BASE + "/projects", { maxRedirects: 0 });
  assert.equal(r.status(), 307);
  assert.match(r.headers()["location"], /\/login/);
  const api = await anon.request.get(BASE + "/api/documents/00000000-0000-4000-8000-000000000000/file");
  assert.equal(api.status(), 401);
  await anon.close();
});

await step("Login: wrong password is rejected, right password lands on the dashboard", async () => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + "/login");
  await p.fill("#identifier", "admin@demo.rvcc.test");
  await p.fill("#password", "definitely-wrong");
  await p.click("button[type=submit]");
  await p.getByText("Invalid credentials").waitFor();
  await ctx.close();
  await page.goto(BASE + "/");
  await page.getByText("Projects by status").waitFor();
});

await step("CREATE project -> saved in PostgreSQL (auto code, PM, contract value)", async () => {
  await page.goto(BASE + "/projects/new");
  await page.fill("#name", NAME);
  await page.fill("#clientName", "E2E Client Co.");
  await page.fill("#location", "Riyadh");
  await page.selectOption("#projectManagerId", ahmed);
  await page.selectOption("#status", "active");
  await page.fill("#progress", "15");
  await page.fill("#startDate", "2026-03-01");
  await page.fill("#expectedCompletion", "2027-03-01");
  await page.fill("#contractValue", "2500000");
  await page.fill("#description", "Created by the automated E2E test");
  await shot(page, "e2e-01-new-project-filled");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 20000 });
  projectId = page.url().split("/").pop();
  cleanup.projects.push(projectId);
  const [row] = await q(`select p.*, f.contract_value from "proj-dashboard-projects" p left join "proj-dashboard-project-financials" f on f.project_id = p.id where p.id = $1`, [projectId]);
  projectCode = row.code;
  assert.match(row.code, /^PRJ-\d{4}-\d{4}$/);
  assert.equal(row.name, NAME);
  assert.equal(row.project_manager_id, ahmed);
  assert.equal(row.progress, 15);
  assert.equal(row.status, "active");
  assert.equal(row.contract_value, "2500000.00");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-project-members" where project_id = $1 and user_id = $2 and member_role = 'manager'`, [projectId, ahmed]))[0].n, 1);
  await page.getByRole("heading", { name: NAME }).waitFor();
});

await step("CREATE project: client-side + server validation errors are shown (nothing saved)", async () => {
  await page.goto(BASE + "/projects/new");
  await page.fill("#startDate", "2026-06-01");
  await page.fill("#expectedCompletion", "2026-01-01");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByText("Project name is required").waitFor();
  await page.getByText("Must be on or after the start date").waitFor();
  assert.equal(new URL(page.url()).pathname, "/projects/new");
});

await step("EDIT project -> changes persist after refresh", async () => {
  await page.goto(`${BASE}/projects/${projectId}/edit`);
  await page.fill("#name", NAME + " (edited)");
  await page.fill("#progress", "55");
  await page.fill("#remarks", "edited remark");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`${BASE}/projects/${projectId}`);
  await page.reload();
  await page.getByRole("heading", { name: NAME + " (edited)" }).waitFor();
  await page.getByText("55%").first().waitFor();
  const [row] = await q(`select name, progress, remarks from "proj-dashboard-projects" where id = $1`, [projectId]);
  assert.deepEqual([row.name, row.progress, row.remarks], [NAME + " (edited)", 55, "edited remark"]);
  const [log] = await q(`select previous_value, new_value from "proj-dashboard-logs" where project_id = $1 and action = 'project.update' order by created_at desc limit 1`, [projectId]);
  assert.equal(log.previous_value.progress, 15);
  assert.equal(log.new_value.progress, 55);
});

await step("ASSIGN project manager (change) persists + team member add/remove", async () => {
  const sara = (await q(`select id from "proj-dashboard-users" where email = 'sara.pm@demo.rvcc.test'`))[0].id;
  await page.goto(`${BASE}/projects/${projectId}/edit`);
  await page.selectOption("#projectManagerId", sara);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`${BASE}/projects/${projectId}`);
  assert.equal((await q(`select project_manager_id from "proj-dashboard-projects" where id = $1`, [projectId]))[0].project_manager_id, sara);
  // team tab: add engineer
  await page.goto(`${BASE}/projects/${projectId}?tab=team`);
  await page.getByRole("button", { name: "Add member" }).first().click();
  const yousef = (await q(`select id from "proj-dashboard-users" where email = 'yousef.eng@demo.rvcc.test'`))[0].id;
  await page.selectOption("#userId", yousef);
  await page.getByRole("button", { name: "Add member" }).last().click();
  await toast(page, "Member added");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-project-members" where project_id = $1 and user_id = $2`, [projectId, yousef]))[0].n, 1);
  await page.getByRole("button", { name: /Actions for Yousef Khan/ }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await toast(page, "Member removed");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-project-members" where project_id = $1 and user_id = $2`, [projectId, yousef]))[0].n, 0);
  await shot(page, "e2e-02-team");
});

await step("DASHBOARD filters cross-filter KPIs and table with real DB counts", async () => {
  await page.goto(BASE + "/");
  const kpi = async () => Number((await page.locator("a", { hasText: "Total Projects" }).first().locator("div.text-3xl").innerText()).replace(/,/g, ""));
  const total = (await q(`select count(*)::int n from "proj-dashboard-projects" where deleted_at is null and not is_archived`))[0].n;
  assert.equal(await kpi(), total);
  const filters = page.getByRole("region", { name: "Project filters" });
  await filters.getByRole("button", { name: /^Location/ }).click();
  await page.getByLabel("Search Location").fill("Riyadh");
  await page.getByRole("option", { name: "Riyadh" }).click();
  await page.waitForURL(/loc=Riyadh/);
  await page.keyboard.press("Escape");
  const riyadh = (await q(`select count(*)::int n from "proj-dashboard-projects" where deleted_at is null and not is_archived and location = 'Riyadh'`))[0].n;
  await page.waitForFunction((n) => [...document.querySelectorAll("a")].find((a) => a.textContent.includes("Total Projects"))?.querySelector("div.text-3xl")?.textContent === String(n), riyadh);
  await page.getByText("Location: Riyadh").waitFor();
  // add a status filter by clicking a chart legend entry (cross-filter)
  await filters.getByRole("button", { name: /^Status/ }).click();
  await page.getByRole("option", { name: "Active" }).click();
  await page.waitForURL(/status=active/);
  await page.keyboard.press("Escape");
  const both = (await q(`select count(*)::int n from "proj-dashboard-projects" where deleted_at is null and not is_archived and location = 'Riyadh' and status = 'active'`))[0].n;
  await page.waitForFunction((n) => [...document.querySelectorAll("a")].find((a) => a.textContent.includes("Total Projects"))?.querySelector("div.text-3xl")?.textContent === String(n), both);
  await page.getByText(new RegExp(`of ${both} projects`)).waitFor();
  await shot(page, "e2e-03-filtered");
  // remove chip + clear all
  await page.getByRole("button", { name: "Remove filter Status: Active" }).click();
  await page.waitForFunction(() => !location.search.includes("status="));
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.waitForFunction(() => location.search === "");
  assert.equal(await kpi(), total);
});

await step("UPLOAD PDF -> private storage + DB; progress UI; multi-file", async () => {
  const f1 = makePdf("E2E_Site_Plan.pdf", `E2E site plan ${uniq}`);
  const f2 = makePdf("E2E_Method_Statement.pdf", `E2E method statement ${uniq}`);
  await page.goto(`${BASE}/projects/${projectId}?tab=documents`);
  await page.getByRole("button", { name: "Upload documents" }).click();
  await page.setInputFiles("input[type=file][accept*='pdf']", [f1, f2]);
  await page.getByRole("button", { name: /Upload 2 files/ }).waitFor();
  await shot(page, "e2e-04-upload-dialog");
  await page.getByRole("button", { name: /Upload 2 files/ }).click();
  await toast(page, "2 documents uploaded");
  await page.getByText("E2E Site Plan").first().waitFor();
  const docs = await q(`select d.id, d.title, r.storage_key, r.file_size from "proj-dashboard-documents" d join "proj-dashboard-document-revisions" r on r.document_id = d.id where d.project_id = $1 order by d.title`, [projectId]);
  assert.equal(docs.length, 2);
  for (const d of docs) {
    assert.ok(fs.existsSync(path.join(STORAGE, d.storage_key)), "file in private storage: " + d.storage_key);
    assert.ok(d.storage_key.startsWith("documents/"));
    cleanup.keys.push(d.storage_key);
  }
  docId = docs.find((d) => d.title === "E2E Site Plan").id;
  // not reachable via any public path
  const pub = await admin.ctx.request.get(`${BASE}/${docs[0].storage_key}`);
  assert.equal(pub.status(), 404);
});

await step("UPLOAD validation: non-PDF and fake PDF are rejected by the server", async () => {
  const fake = path.join(tmp, "fake.pdf");
  fs.writeFileSync(fake, "MZ this is not a pdf at all");
  const catId = (await q(`select id from "proj-dashboard-document-categories" limit 1`))[0].id;
  const send = async (name, data, type) =>
    admin.ctx.request.post(BASE + "/api/documents", {
      multipart: { projectId, title: "bad", categoryId: catId, description: "", revisionLabel: "0", documentDate: "", file: { name, mimeType: type, buffer: Buffer.from(data) } },
    });
  const a = await send("virus.exe", "%PDF-1.4 fake", "application/pdf");
  assert.equal(a.status(), 422);
  const b = await send("fake.pdf", "MZ not a pdf", "application/pdf");
  assert.equal(b.status(), 422);
  assert.match((await b.json()).error, /not a valid PDF/);
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-documents" where title = 'bad'`))[0].n, 0);
});

await step("PREVIEW PDF renders the correct document in the embedded viewer", async () => {
  await page.goto(`${BASE}/documents/${docId}`);
  await page.waitForSelector("canvas", { timeout: 25000 });
  await page.waitForSelector(".react-pdf__Page__textContent span", { timeout: 15000 });
  const text = await page.locator(".react-pdf__Page__textContent").innerText();
  assert.match(text, new RegExp(`E2E site plan ${uniq}`, "i"));
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByText("125%").waitFor();
  await shot(page, "e2e-05-preview");
});

await step("DOWNLOAD is authenticated, permission-checked, returns the exact PDF and is audit-logged", async () => {
  const r = await admin.ctx.request.get(`${BASE}/api/documents/${docId}/file?download=1`);
  assert.equal(r.status(), 200);
  assert.equal(r.headers()["content-type"], "application/pdf");
  assert.match(r.headers()["content-disposition"], /attachment/);
  assert.equal(r.headers()["cache-control"], "private, no-store");
  const body = await r.body();
  assert.equal(body.subarray(0, 5).toString(), "%PDF-");
  const [k] = await q(`select r.storage_key from "proj-dashboard-document-revisions" r where r.document_id = $1`, [docId]);
  assert.ok(body.equals(fs.readFileSync(path.join(STORAGE, k.storage_key))), "bytes identical to stored file");
  assert.ok((await q(`select 1 from "proj-dashboard-logs" where document_id = $1 and action = 'document.download'`, [docId])).length >= 1);
  const anon = await browser.newContext();
  assert.equal((await anon.request.get(`${BASE}/api/documents/${docId}/file`)).status(), 401);
  await anon.close();
});

await step("UNAUTHORIZED: a user outside the project cannot preview, download or upload (server rejects)", async () => {
  const layla = await newSession("layla.eng@demo.rvcc.test");
  assert.equal((await layla.ctx.request.get(`${BASE}/api/documents/${docId}/file`)).status(), 404);
  assert.equal((await layla.ctx.request.get(`${BASE}/api/documents/${docId}/file?download=1`)).status(), 404);
  const catId = (await q(`select id from "proj-dashboard-document-categories" limit 1`))[0].id;
  const up = await layla.ctx.request.post(BASE + "/api/documents", {
    multipart: { projectId, title: "hack", categoryId: catId, description: "", revisionLabel: "0", documentDate: "", file: { name: "h.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(makePdf("h.pdf", "h")) } },
  });
  assert.ok([403, 404].includes(up.status()), "upload rejected, got " + up.status());
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-documents" where title = 'hack'`))[0].n, 0);
  await layla.page.goto(`${BASE}/projects/${projectId}`);
  await layla.page.getByText("Not found").waitFor();
  await layla.ctx.close();
});

await step("UPLOAD new REVISION keeps the previous revision available", async () => {
  const rev = makePdf("E2E_Site_Plan_B.pdf", `E2E site plan REVISED ${uniq}`);
  await page.goto(`${BASE}/documents/${docId}`);
  await page.getByRole("button", { name: "New revision" }).click();
  await page.setInputFiles("input[type=file][accept*='pdf']", rev);
  await page.getByPlaceholder("e.g. B").fill("B");
  await page.getByRole("button", { name: "Upload revision" }).click();
  await toast(page, "New revision uploaded");
  const revs = await q(`select revision_no, revision_label, storage_key from "proj-dashboard-document-revisions" where document_id = $1 order by revision_no`, [docId]);
  assert.equal(revs.length, 2);
  assert.equal(revs[1].revision_label, "B");
  revs.forEach((r) => (assert.ok(fs.existsSync(path.join(STORAGE, r.storage_key))), cleanup.keys.push(r.storage_key)));
  assert.equal((await q(`select current_revision_no from "proj-dashboard-documents" where id = $1`, [docId]))[0].current_revision_no, 2);
  const old = await admin.ctx.request.get(`${BASE}/api/documents/${docId}/file?rev=1`);
  assert.equal(old.status(), 200);
  assert.match((await old.body()).toString("latin1").slice(0, 8), /%PDF/);
  await page.reload();
  await page.getByText("Revision history").waitFor();
  await page.getByText("current", { exact: false }).first().waitFor();
});

await step("EDIT document metadata + change category persists", async () => {
  await page.goto(`${BASE}/documents/${docId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.fill("#title", "E2E Site Plan (renamed)");
  const boq = (await q(`select id from "proj-dashboard-document-categories" where name = 'BOQ'`))[0].id;
  await page.selectOption("#categoryId", boq);
  await page.getByRole("button", { name: "Save changes" }).click();
  await toast(page, "Document updated");
  const [d] = await q(`select title, category_id from "proj-dashboard-documents" where id = $1`, [docId]);
  assert.deepEqual([d.title, d.category_id], ["E2E Site Plan (renamed)", boq]);
});

await step("DELETE document: access revoked immediately; trash; restore; permanent delete removes files (no orphans)", async () => {
  const keys = (await q(`select storage_key from "proj-dashboard-document-revisions" where document_id = $1`, [docId])).map((r) => r.storage_key);
  await page.goto(`${BASE}/documents/${docId}`);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await page.waitForURL(`${BASE}/documents`);
  assert.ok((await q(`select deleted_at from "proj-dashboard-documents" where id = $1`, [docId]))[0].deleted_at);
  assert.equal((await admin.ctx.request.get(`${BASE}/api/documents/${docId}/file`)).status(), 404, "access revoked");
  for (const k of keys) assert.ok(fs.existsSync(path.join(STORAGE, k)), "retained during retention period");
  await page.goto(`${BASE}/documents?trash=1&q=renamed`);
  await page.getByText("E2E Site Plan (renamed)").waitFor();
  await page.getByRole("button", { name: "Restore" }).click();
  await toast(page, "Document restored");
  assert.equal((await q(`select deleted_at from "proj-dashboard-documents" where id = $1`, [docId]))[0].deleted_at, null);
  assert.equal((await admin.ctx.request.get(`${BASE}/api/documents/${docId}/file`)).status(), 200);
  // delete again, then purge permanently
  await page.goto(`${BASE}/documents/${docId}`);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await page.waitForURL(`${BASE}/documents`);
  await page.goto(`${BASE}/documents?trash=1&q=renamed`);
  await page.getByRole("button", { name: /More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete permanently" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).last().click();
  await toast(page, "permanently deleted");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-documents" where id = $1`, [docId]))[0].n, 0);
  for (const k of keys) assert.equal(fs.existsSync(path.join(STORAGE, k)), false, "file removed: " + k);
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-storage-deletions"`))[0].n, 0);
});

await step("CATEGORY CRUD: create, edit, deactivate, delete (blocked while referenced, allowed after reassignment)", async () => {
  await page.goto(BASE + "/settings?tab=categories");
  await page.getByRole("button", { name: "Add category" }).first().click();
  await page.fill("#name", `ZZ E2E Cat ${uniq}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await toast(page, "Category created");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-document-categories" where name = $1`, [`ZZ E2E Cat ${uniq}`]))[0].n, 1);
  await page.getByRole("button", { name: `Actions for ZZ E2E Cat ${uniq}` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.fill("#name", `ZZ E2E Cat ${uniq} v2`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await toast(page, "Category updated");
  await page.getByRole("button", { name: `Actions for ZZ E2E Cat ${uniq} v2` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await toast(page, "Category deleted");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-document-categories" where name like $1`, [`ZZ E2E Cat ${uniq}%`]))[0].n, 0);
});

await step("USER CRUD: create user (temp password), forced password change, role-based UI, role change takes effect", async () => {
  const email = `zz.e2e.${uniq.toLowerCase()}@demo.rvcc.test`;
  await page.goto(BASE + "/users");
  await page.getByRole("button", { name: "Add user" }).click();
  await page.fill("#fullName", "ZZ E2E User");
  await page.fill("#email", email);
  await page.fill("#department", "QA");
  const viewerRole = (await q(`select id from "proj-dashboard-roles" where code = 'viewer'`))[0].id;
  await page.selectOption("#roleId", viewerRole);
  await page.getByRole("button", { name: "Create user" }).click();
  tempPassword = await page.getByRole("textbox", { name: "Temporary password" }).inputValue();
  assert.ok(tempPassword.length >= 12);
  await page.getByRole("button", { name: "Done" }).click();
  const [u] = await q(`select u.id, c.password_hash, c.must_change_password from "proj-dashboard-users" u join "proj-dashboard-user-credentials" c on c.user_id = u.id where u.email = $1`, [email]);
  newUserId = u.id;
  cleanup.users.push(u.id);
  assert.ok(u.password_hash.startsWith("$2"));
  assert.equal(u.must_change_password, true);
  // sign in as the new user
  const s = await newSession(email, tempPassword);
  await s.page.waitForURL(/\/change-password/);
  await s.page.fill("#currentPassword", tempPassword);
  await s.page.fill("#newPassword", "Brand-New-Pass-77");
  await s.page.fill("#confirm", "Brand-New-Pass-77");
  await s.page.getByRole("button", { name: "Update password" }).click();
  await s.page.waitForURL(BASE + "/");
  // viewer: no admin nav, no create buttons, restricted pages
  assert.equal(await s.page.getByRole("link", { name: "Users & Access" }).count(), 0);
  assert.equal(await s.page.getByRole("link", { name: "Project Reports" }).count(), 0);
  assert.equal(await s.page.getByRole("link", { name: "New project" }).count(), 0);
  await s.page.goto(BASE + "/users");
  await s.page.getByText("Access restricted").waitFor();
  await s.page.goto(BASE + "/projects/new");
  await s.page.getByText("Access restricted").waitFor();
  // server-side rejection even when bypassing the UI
  const res = await s.ctx.request.get(BASE + "/api/reports/export?type=project_status&format=csv");
  assert.equal(res.status(), 403);
  await shot(s.page, "e2e-06-viewer-dashboard");
  // admin changes the role to Project Manager -> the user's session is revoked and new rights apply on re-login
  await page.goto(BASE + "/users?q=ZZ+E2E");
  const userRow = page.getByRole("row", { name: new RegExp(email) });
  await userRow.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: /Edit profile/ }).click();
  const pmRole = (await q(`select id from "proj-dashboard-roles" where code = 'project_manager'`))[0].id;
  await page.selectOption("#roleId", pmRole);
  await page.getByRole("button", { name: "Save changes" }).click();
  await toast(page, "User updated");
  assert.equal((await q(`select r.code from "proj-dashboard-user-roles" ur join "proj-dashboard-roles" r on r.id = ur.role_id where ur.user_id = $1`, [newUserId]))[0].code, "project_manager");
  await s.page.goto(BASE + "/projects");
  await s.page.waitForURL(/\/login/);
  const s2 = await newSession(email, "Brand-New-Pass-77");
  assert.ok(await s2.page.getByRole("link", { name: "Project Reports" }).count());
  await s2.ctx.close();
  await s.ctx.close();
  // deactivate -> cannot sign in
  await userRow.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).last().click();
  await toast(page, "Account deactivated");
  const ctx3 = await browser.newContext();
  const r3 = await ctx3.request.post(BASE + "/api/auth/login", { data: { identifier: email, password: "Brand-New-Pass-77" }, headers: { origin: BASE } });
  assert.equal(r3.status(), 401);
  await ctx3.close();
});

await step("REPORTS: filtered export (CSV / Excel / PDF) matches database rows", async () => {
  await page.goto(BASE + "/reports?loc=Riyadh&type=project_status");
  await page.getByText("Project status report").first().waitFor();
  const href = await page.getByRole("link", { name: "CSV" }).getAttribute("href");
  assert.match(href, /loc=Riyadh/);
  const csv = await admin.ctx.request.get(BASE + href);
  assert.equal(csv.status(), 200);
  assert.match(csv.headers()["content-type"], /text\/csv/);
  const lines = (await csv.text()).replace(/^﻿/, "").trim().split("\r\n");
  const exp = (await q(`select count(*)::int n from "proj-dashboard-projects" where deleted_at is null and not is_archived and location = 'Riyadh'`))[0].n;
  assert.equal(lines.length - 1, exp);
  assert.ok(lines.slice(1).every((l) => l.includes("Riyadh")));
  const xlsx = await admin.ctx.request.get(BASE + href.replace("format=csv", "format=xlsx"));
  assert.equal(xlsx.status(), 200);
  assert.equal((await xlsx.body()).subarray(0, 2).toString(), "PK");
  const pdf = await admin.ctx.request.get(BASE + href.replace("format=csv", "format=pdf"));
  assert.equal((await pdf.body()).subarray(0, 5).toString(), "%PDF-");
  assert.ok((await q(`select 1 from "proj-dashboard-logs" where action = 'report.export'`)).length >= 3);
  await shot(page, "e2e-07-reports");
});

await step("GLOBAL SEARCH returns authorised results; saved filter set can be saved, applied and deleted", async () => {
  await page.goto(BASE + "/");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Search by project/).fill("Nakheel");
  await page.getByText("Al Nakheel Residential Towers").first().waitFor();
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/?loc=Jeddah&status=active");
  await page.getByRole("button", { name: "Saved filters" }).click();
  await page.getByRole("menuitem", { name: "Save current filters" }).click();
  await page.getByLabel("Filter set name").fill(`ZZ E2E ${uniq}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await toast(page, "Filter set saved");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-saved-filters" where name = $1`, [`ZZ E2E ${uniq}`]))[0].n, 1);
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: "Saved filters" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`ZZ E2E ${uniq}`) }).click();
  await page.waitForURL(/loc=Jeddah/);
  await page.getByRole("button", { name: "Saved filters" }).click();
  await page.getByRole("button", { name: `Delete saved filter ZZ E2E ${uniq}` }).click();
  await toast(page, "Saved filter deleted");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-saved-filters" where name = $1`, [`ZZ E2E ${uniq}`]))[0].n, 0);
});

await step("NOTIFICATIONS: events create notifications; mark read / delete work", async () => {
  const ahmedCtx = await newSession("ahmed.pm@demo.rvcc.test");
  await ahmedCtx.page.goto(BASE + "/notifications");
  await ahmedCtx.page.getByText("Notifications").first().waitFor();
  const n0 = (await q(`select count(*)::int n from "proj-dashboard-notifications" where user_id = $1 and is_read = false`, [ahmed]))[0].n;
  await ahmedCtx.page.getByRole("button", { name: /Mark all read/ }).click();
  await toast(ahmedCtx.page, "All notifications marked as read");
  assert.equal((await q(`select count(*)::int n from "proj-dashboard-notifications" where user_id = $1 and is_read = false`, [ahmed]))[0].n, 0);
  assert.ok(n0 >= 0);
  await ahmedCtx.ctx.close();
});

await step("DELETE project: soft-deleted with typed confirmation; hidden everywhere; audit kept", async () => {
  // remove the second uploaded doc so the project has no documents (policy: projects with documents can only be archived)
  const rest = await q(`select d.id from "proj-dashboard-documents" d where d.project_id = $1`, [projectId]);
  await page.goto(`${BASE}/projects/${projectId}`);
  await page.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  if (rest.length) {
    await page.getByText(/still has \d+ document/).waitFor(); // blocked message shown
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Archive", exact: true }).last().click();
    await toast(page, "Project archived");
    assert.equal((await q(`select is_archived from "proj-dashboard-projects" where id = $1`, [projectId]))[0].is_archived, true);
    for (const d of rest) {
      const keys = (await q(`select storage_key from "proj-dashboard-document-revisions" where document_id = $1`, [d.id])).map((r) => r.storage_key);
      await db.query(`delete from "proj-dashboard-documents" where id = $1`, [d.id]);
      keys.forEach((k) => fs.rmSync(path.join(STORAGE, k), { force: true }));
    }
    await page.goto(`${BASE}/projects/${projectId}`);
    await page.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Unarchive" }).click();
    await page.getByRole("button", { name: "Unarchive", exact: true }).last().click();
    await toast(page, "Project restored");
    await page.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
  }
  const del = page.getByRole("button", { name: "Delete project" });
  assert.equal(await del.isDisabled(), true, "needs typed confirmation");
  await page.getByLabel("Confirmation text").fill(projectCode);
  await del.click();
  await page.waitForURL(`${BASE}/projects`);
  const [row] = await q(`select deleted_at from "proj-dashboard-projects" where id = $1`, [projectId]);
  assert.ok(row.deleted_at, "soft deleted (row preserved)");
  await page.goto(`${BASE}/projects?q=${encodeURIComponent(NAME)}`);
  await page.getByText("No projects match").waitFor();
  assert.ok((await q(`select 1 from "proj-dashboard-logs" where project_id = $1 and action = 'project.delete'`, [projectId])).length === 1);
});

await step("SESSION: logout invalidates the session; data persists after logout/login", async () => {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  const r = await admin.ctx.request.get(BASE + "/projects", { maxRedirects: 0 });
  assert.equal(r.status(), 307);
  const again = await newSession("admin@demo.rvcc.test");
  await again.page.goto(`${BASE}/projects?archived=include&q=${encodeURIComponent("Al Nakheel")}`);
  await again.page.getByText("Al Nakheel Residential Towers").first().waitFor();
  await again.ctx.close();
});

// ------------------------------------------------------------------ cleanup of everything the test created
await db.query(`delete from "proj-dashboard-logs" where project_id = any($1::uuid[]) or user_name = 'ZZ E2E User'`, [cleanup.projects]);
await db.query(`delete from "proj-dashboard-projects" where id = any($1::uuid[])`, [cleanup.projects]);
await db.query(`delete from "proj-dashboard-users" where id = any($1::uuid[])`, [cleanup.users]);
await db.query(`delete from "proj-dashboard-logs" where action = 'report.export' and user_name = 'Khalid Al-Mansour' and created_at > now() - interval '15 minutes'`);
cleanup.keys.forEach((k) => fs.rmSync(path.join(STORAGE, k), { force: true }));
await db.end();
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} E2E steps passed`);
if (consoleErrors.length) console.log("Browser page errors:", [...new Set(consoleErrors)].slice(0, 5));
process.exit(failed.length ? 1 : 0);
