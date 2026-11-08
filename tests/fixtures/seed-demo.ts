// TEST FIXTURE ONLY - fictional data used by the automated tests (npm run test:seed). NOT part of the real portal: never run against production.
// Usage: npm run db:seed        (refuses to run twice; pass --force to wipe previous demo data first)
import crypto from "node:crypto";
import "../../scripts/env";
import { jsPDF } from "jspdf";
import { sys } from "../../src/lib/db";
import { hashPassword } from "../../src/server/password";
import { getStorage } from "../../src/server/storage";


const DEMO_PASSWORD = "Demo@12345";
let seedN = 42;
const rnd = () => ((seedN = (seedN * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const day = (offset: number) => new Date(Date.now() + offset * 86400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const USERS = [
  { key: "admin", name: "Khalid Al-Mansour", role: "super_admin", dept: "IT & Administration", title: "System Administrator", email: "admin@demo.rvcc.test" },
  { key: "mgmt", name: "Noura Al-Qahtani", role: "management", dept: "Executive Office", title: "Director of Projects", email: "management@demo.rvcc.test" },
  { key: "ahmed", name: "Ahmed Al-Rashid", role: "project_manager", dept: "Projects – Central", title: "Senior Project Manager", email: "ahmed.pm@demo.rvcc.test" },
  { key: "sara", name: "Sara Al-Dosari", role: "project_manager", dept: "Projects – Western", title: "Project Manager", email: "sara.pm@demo.rvcc.test" },
  { key: "omar", name: "Omar Haddad", role: "project_manager", dept: "Projects – Eastern", title: "Project Manager", email: "omar.pm@demo.rvcc.test" },
  { key: "yousef", name: "Yousef Khan", role: "engineer", dept: "Civil Engineering", title: "Site Engineer", email: "yousef.eng@demo.rvcc.test" },
  { key: "layla", name: "Layla Mahmoud", role: "engineer", dept: "MEP Engineering", title: "MEP Engineer", email: "layla.eng@demo.rvcc.test" },
  { key: "imran", name: "Imran Ali", role: "engineer", dept: "Quantity Surveying", title: "Quantity Surveyor", email: "imran.eng@demo.rvcc.test" },
  { key: "hassan", name: "Hassan Al-Otaibi", role: "viewer", dept: "Finance", title: "Finance Analyst", email: "viewer@demo.rvcc.test" },
];

type P = { code: string; name: string; client: string; contractor: string; consultant: string; loc: string; cat: string; pm: string; status: string; start: number; dur: number; progress: number; value: number; team: string[]; viewers?: string[]; done?: number };
const PROJECTS: P[] = [
  { code: "RVCC-RES-001", name: "Al Nakheel Residential Towers", client: "Nakheel Development Co. (demo)", contractor: "RVCC Contracting", consultant: "Zuhair Fayez Partners (demo)", loc: "Riyadh", cat: "Building Construction", pm: "ahmed", status: "active", start: -420, dur: 640, progress: 62, value: 285000000, team: ["yousef", "imran"], viewers: ["hassan"] },
  { code: "RVCC-RTL-002", name: "Jeddah Corniche Marina Mall", client: "Red Sea Retail Holding (demo)", contractor: "RVCC Contracting", consultant: "Dar Al-Handasah (demo)", loc: "Jeddah", cat: "Building Construction", pm: "sara", status: "active", start: -300, dur: 700, progress: 38, value: 410000000, team: ["layla", "imran"] },
  { code: "RVCC-IND-003", name: "Dammam Industrial Warehouse Complex", client: "Gulf Logistics Authority (demo)", contractor: "RVCC Contracting", consultant: "Eastern Engineering Bureau (demo)", loc: "Dammam", cat: "Industrial & Warehousing", pm: "omar", status: "completed", start: -520, dur: 440, progress: 100, value: 96500000, team: ["yousef"], done: -58 },
  { code: "RVCC-INF-004", name: "Riyadh Metro Link Road – Package 4", client: "Ministry of Transport (demo)", contractor: "RVCC Contracting JV", consultant: "Parsons Gulf (demo)", loc: "Riyadh", cat: "Infrastructure & Roads", pm: "ahmed", status: "active", start: -250, dur: 400, progress: 41, value: 178000000, team: ["yousef", "layla"] },
  { code: "RVCC-HOT-005", name: "Khobar Seafront Hotel Fit-out", client: "Seafront Hospitality Group (demo)", contractor: "RVCC Fit-out Division", consultant: "Studio Interiors (demo)", loc: "Khobar", cat: "Fit-out & Interiors", pm: "omar", status: "on_hold", start: -180, dur: 300, progress: 34, value: 54200000, team: ["imran"] },
  { code: "RVCC-MEP-006", name: "Madinah Logistics Hub – MEP Works", client: "Madinah Logistics Co. (demo)", contractor: "RVCC MEP Division", consultant: "Buro Gulf (demo)", loc: "Madinah", cat: "MEP Works", pm: "sara", status: "active", start: -150, dur: 260, progress: 52, value: 38700000, team: ["layla"] },
  { code: "RVCC-RES-007", name: "Abha Mountain Resort Villas", client: "Highland Tourism Development (demo)", contractor: "RVCC Contracting", consultant: "Alpine Design House (demo)", loc: "Abha", cat: "Building Construction", pm: "ahmed", status: "planning", start: 30, dur: 540, progress: 4, value: 132000000, team: ["yousef"] },
  { code: "RVCC-CIV-008", name: "Tabuk Water Treatment Plant", client: "National Water Company (demo)", contractor: "RVCC Contracting", consultant: "Hydro Consult (demo)", loc: "Tabuk", cat: "Civil Works", pm: "omar", status: "active", start: -380, dur: 340, progress: 88, value: 121000000, team: ["yousef", "layla"] },
  { code: "RVCC-LND-009", name: "Riyadh Business Park Landscaping", client: "Capital Business Parks (demo)", contractor: "RVCC Landscape Division", consultant: "Green Axis Studio (demo)", loc: "Riyadh", cat: "Landscaping", pm: "sara", status: "completed", start: -300, dur: 210, progress: 100, value: 17800000, team: ["imran"], done: -64 },
  { code: "RVCC-MNT-010", name: "Jeddah Airport Road Maintenance – Phase 2", client: "Jeddah Municipality (demo)", contractor: "RVCC Contracting", consultant: "Municipal Works Consultants (demo)", loc: "Jeddah", cat: "Maintenance & Renovation", pm: "ahmed", status: "active", start: -90, dur: 180, progress: 47, value: 26400000, team: ["yousef"] },
  { code: "RVCC-ADM-011", name: "Dammam Port Admin Building", client: "Eastern Ports Authority (demo)", contractor: "RVCC Contracting", consultant: "Eastern Engineering Bureau (demo)", loc: "Dammam", cat: "Building Construction", pm: "sara", status: "cancelled", start: -400, dur: 360, progress: 18, value: 41000000, team: ["imran"], done: -120 },
  { code: "RVCC-EDU-012", name: "Riyadh Smart Campus", client: "Smart Campus Foundation (demo)", contractor: "RVCC Contracting", consultant: "Campus Planning Group (demo)", loc: "Riyadh", cat: "Building Construction", pm: "omar", status: "planning", start: 10, dur: 720, progress: 0, value: 365000000, team: ["layla", "yousef"] },
];

const DOC_TITLES: [string, string][] = [
  ["Main Construction Contract", "Contracts & Agreements"], ["Subcontract Agreement – Structural Works", "Contracts & Agreements"],
  ["General Arrangement Drawings", "Drawings"], ["Structural Shop Drawings", "Drawings"], ["MEP Coordination Drawings", "Drawings"],
  ["Bill of Quantities – Civil", "BOQ"], ["Bill of Quantities – MEP", "BOQ"], ["Concrete & Reinforcement Specification", "Technical Specifications"],
  ["Method Statement – Excavation & Shoring", "Method Statements"], ["Method Statement – Concrete Pouring", "Method Statements"],
  ["Material Submittal – Reinforcement Steel", "Material Submittals"], ["Material Submittal – Waterproofing", "Material Submittals"],
  ["Inspection Report – Foundation", "Inspection Reports"], ["Inspection Report – Slab Level 3", "Inspection Reports"],
  ["Monthly Progress Report", "Progress Reports"], ["Weekly Progress Summary", "Progress Reports"],
  ["Client Correspondence – Variation Request", "Project Correspondence"], ["Consultant Correspondence – RFI Responses", "Project Correspondence"],
  ["Meeting Minutes – Kick-off", "Meeting Minutes"], ["Meeting Minutes – Site Coordination", "Meeting Minutes"],
  ["Municipality Permit Approval", "Approvals"], ["Client Approval – Material Samples", "Approvals"], ["HSE Plan", "Other Documents"],
];

function makePdf(title: string, project: string, code: string, rev: string, uploader: string): Buffer {
  const doc = new jsPDF();
  const pages = 1 + Math.floor(rnd() * 3);
  for (let p = 1; p <= pages; p++) {
    if (p > 1) doc.addPage();
    doc.setFontSize(10); doc.setTextColor(180, 40, 40);
    doc.text("DEMO DOCUMENT – FICTIONAL DATA – NOT A REAL RECORD", 15, 12);
    doc.setTextColor(20); doc.setFontSize(18); doc.text(title, 15, 30);
    doc.setFontSize(11);
    doc.text(`Project: ${project} (${code})`, 15, 42);
    doc.text(`Revision: ${rev}     Prepared by: ${uploader}     Page ${p} of ${pages}`, 15, 49);
    doc.setDrawColor(150); doc.line(15, 54, 195, 54);
    const lorem = "This sample page was generated by the RVCC portal demo seed to exercise PDF upload, preview, revision history and secure download. The text is placeholder content and contains no real project information.";
    for (let i = 0; i < 9; i++) doc.text(doc.splitTextToSize(`${i + 1}. ${lorem}`, 180), 15, 66 + i * 22);
  }
  return Buffer.from(doc.output("arraybuffer"));
}

async function main() {
  const force = process.argv.includes("--force");
  const storage = getStorage();
  const existing = await sys(async (db) => (await db.query(`select count(*)::int as n from "proj-dashboard-users" where is_demo`)).rows[0].n);
  if (existing && !force) { console.log("Demo data already present. Use --force to wipe and re-seed."); process.exit(0); }
  if (force) {
    const keys = await sys(async (db) => {
      const k = (await db.query(`select storage_key from "proj-dashboard-document-revisions" where is_demo`)).rows.map((r) => r.storage_key as string);
      const c = (await db.query(`select cover_key from "proj-dashboard-projects" where is_demo and cover_key is not null`)).rows.map((r) => r.cover_key as string);
      await db.query(`delete from "proj-dashboard-notifications" where user_id in (select id from "proj-dashboard-users" where is_demo)`);
      await db.query(`delete from "proj-dashboard-logs" where is_demo`);
      await db.query(`delete from "proj-dashboard-projects" where is_demo`);
      await db.query(`delete from "proj-dashboard-users" where is_demo`);
      return [...k, ...c];
    });
    for (const k of keys) await storage.delete(k).catch(() => undefined);
    console.log(`Removed previous demo data (${keys.length} files).`);
  }

  const pwHash = await hashPassword(DEMO_PASSWORD);
  const cats = await sys(async (db) => (await db.query(`select id, name from "proj-dashboard-document-categories"`)).rows);
  const catId = (n: string) => cats.find((c) => c.name === n)!.id as string;
  const roleRows = await sys(async (db) => (await db.query(`select id, code from "proj-dashboard-roles"`)).rows);

  const uid: Record<string, string> = {};
  const uname: Record<string, string> = {};
  await sys(async (db) => {
    for (const u of USERS) {
      const r = await db.query(
        `insert into "proj-dashboard-users" (email, full_name, department, job_title, is_demo, last_login_at) values ($1,$2,$3,$4,true, now() - ($5 || ' hours')::interval) returning id`,
        [u.email, u.name, u.dept, u.title, String(Math.floor(rnd() * 200))],
      );
      uid[u.key] = r.rows[0].id; uname[u.key] = u.name;
      await db.query(`insert into "proj-dashboard-user-roles" (user_id, role_id) values ($1,$2)`, [r.rows[0].id, roleRows.find((x) => x.code === u.role)!.id]);
      await db.query(`insert into "proj-dashboard-user-credentials" (user_id, password_hash, must_change_password) values ($1,$2,false)`, [r.rows[0].id, pwHash]);
    }
  });

  let docCount = 0;
  let revCount = 0;
  for (const p of PROJECTS) {
    const start = day(p.start);
    const expected = day(p.start + p.dur);
    const created = new Date(Math.min(start.getTime() - 15 * 86400_000, Date.now() - 86400_000));
    const projectId = crypto.randomUUID();
    const uploaders = [p.pm, ...p.team];

    await sys(async (db) => {
      await db.query(
        `insert into "proj-dashboard-projects" (id, code, name, client_name, main_contractor, consultant, location, description, category, project_manager_id, status, progress,
                               start_date, expected_completion, actual_completion, remarks, is_demo, created_at, updated_at, created_by, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$17,$18,$18)`,
        [projectId, p.code, p.name, p.client, p.contractor, p.consultant, p.loc,
         `[DEMO DATA] ${p.name} – a fictional ${p.cat.toLowerCase()} project in ${p.loc} used to demonstrate the portal.`, p.cat, uid[p.pm], p.status, p.progress,
         ymd(start), ymd(expected), p.done !== undefined ? ymd(day(p.done)) : null, p.status === "on_hold" ? "Waiting on client approval of revised interior package." : null, created, uid.admin],
      );
      await db.query(`insert into "proj-dashboard-project-financials" (project_id, contract_value, updated_by) values ($1,$2,$3)`, [projectId, p.value, uid.admin]);
      await db.query(
        `insert into "proj-dashboard-project-members" (project_id, user_id, member_role, can_edit, can_upload, can_delete_docs, can_manage_team, created_by) values ($1,$2,'manager',true,true,true,true,$3)`,
        [projectId, uid[p.pm], uid.admin],
      );
      for (const t of p.team)
        await db.query(`insert into "proj-dashboard-project-members" (project_id, user_id, member_role, can_upload, created_by) values ($1,$2,'engineer',$3,$4)`, [projectId, uid[t], t !== "imran" || p.code.endsWith("1"), uid.admin]);
      for (const v of p.viewers ?? [])
        await db.query(`insert into "proj-dashboard-project-members" (project_id, user_id, member_role, created_by) values ($1,$2,'viewer',$3)`, [projectId, uid[v], uid.admin]);
      await db.query(
        `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, project_id, summary, new_value, is_demo, created_at)
         values ($1,$2,'project.create','project',$3,$3,$4,$5,true,$6)`,
        [uid.admin, uname.admin, projectId, `Created project ${p.code} – ${p.name}`, JSON.stringify({ code: p.code, status: "planning" }), created],
      );
      if (p.status !== "planning")
        await db.query(
          `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, project_id, summary, previous_value, new_value, is_demo, created_at)
           values ($1,$2,'project.status_change','project',$3,$3,$4,$5,$6,true,$7)`,
          [uid[p.pm], uname[p.pm], projectId, `Status changed from planning to ${p.status === "on_hold" ? "active" : p.status} on ${p.code}`, JSON.stringify({ status: "planning" }), JSON.stringify({ status: p.status === "on_hold" ? "active" : p.status }), new Date(Math.max(start.getTime(), created.getTime()) + 86400_000)],
        );
      if (p.status === "on_hold")
        await db.query(
          `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, project_id, summary, previous_value, new_value, is_demo, created_at)
           values ($1,$2,'project.status_change','project',$3,$3,$4,$5,$6,true, now() - interval '25 days')`,
          [uid[p.pm], uname[p.pm], projectId, `Status changed from active to on_hold on ${p.code}`, JSON.stringify({ status: "active" }), JSON.stringify({ status: "on_hold" })],
        );
    });

    // documents + revisions (PDF files are written to private storage)
    const n = 4 + Math.floor(rnd() * 4);
    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
      let k = Math.floor(rnd() * DOC_TITLES.length);
      while (used.has(k)) k = (k + 1) % DOC_TITLES.length;
      used.add(k);
      const [title, category] = DOC_TITLES[k];
      const docId = crypto.randomUUID();
      const uploader = pick(uploaders);
      const earliest = Math.max(start.getTime() - 10 * 86400_000, Date.now() - 330 * 86400_000);
      const first = new Date(earliest + rnd() * (Date.now() - earliest - 5 * 86400_000));
      const revisions = 1 + Math.floor(rnd() * 3);
      const files: { id: string; key: string; at: Date; label: string; no: number; data: Buffer }[] = [];
      for (let r = 1; r <= revisions; r++) {
        const rid = crypto.randomUUID();
        const at = new Date(first.getTime() + (r - 1) * (5 + rnd() * 25) * 86400_000);
        const at2 = at.getTime() > Date.now() ? new Date(Date.now() - 3600_000) : at;
        const label = r === 1 ? "A" : String.fromCharCode(64 + r);
        files.push({ id: rid, key: `documents/${projectId}/${docId}/${rid}.pdf`, at: at2, label, no: r, data: makePdf(title, p.name, p.code, label, uname[uploader]) });
      }
      for (const f of files) await storage.put(f.key, f.data, "application/pdf");
      await sys(async (db) => {
        await db.query(
          `insert into "proj-dashboard-documents" (id, project_id, category_id, title, description, document_date, current_revision_no, is_demo, created_at, updated_at, created_by, updated_by)
           values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$10)`,
          [docId, projectId, catId(category), title, `[DEMO] ${category} document for ${p.code}.`, ymd(first), revisions, first, files[files.length - 1].at, uid[uploader]],
        );
        for (const f of files) {
          await db.query(
            `insert into "proj-dashboard-document-revisions" (id, document_id, revision_no, revision_label, file_name, storage_key, file_size, checksum, notes, is_demo, created_at, created_by)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11)`,
            [f.id, docId, f.no, f.label, `${title.replace(/[^A-Za-z0-9]+/g, "_")}_Rev${f.label}.pdf`, f.key, f.data.length, crypto.createHash("sha256").update(f.data).digest("hex"), f.no > 1 ? "Updated per consultant comments" : null, f.at, uid[uploader]],
          );
          await db.query(
            `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, project_id, document_id, summary, is_demo, created_at)
             values ($1,$2,$3,'document',$4,$5,$4,$6,true,$7)`,
            [uid[uploader], uname[uploader], f.no === 1 ? "document.upload" : "document.revision", docId, projectId,
             f.no === 1 ? `Uploaded "${title}" to ${p.code}` : `Uploaded revision ${f.label} of "${title}"`, f.at],
          );
          revCount++;
        }
      });
      docCount++;
    }
    // a few extra progress-update entries so monthly activity looks lived-in
    await sys(async (db) => {
      for (let i = 0; i < 6; i++) {
        const at = new Date(Date.now() - rnd() * 300 * 86400_000);
        if (at < start) continue;
        await db.query(
          `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, project_id, summary, is_demo, created_at)
           values ($1,$2,'project.update','project',$3,$3,$4,true,$5)`,
          [uid[p.pm], uname[p.pm], projectId, `Updated ${p.code}: progress`, at],
        );
      }
    });
  }

  // a handful of notifications
  await sys(async (db) => {
    const pr = (await db.query(`select id, code, name from "proj-dashboard-projects" where is_demo order by code limit 4`)).rows;
    for (const key of ["ahmed", "sara", "omar", "mgmt", "admin"])
      for (const p of pr.slice(0, 3))
        await db.query(
          `insert into "proj-dashboard-notifications" (user_id, type, title, body, link, project_id, is_read, created_at) values ($1,'document.uploaded','New document uploaded',$2,$3,$4,$5, now() - ($6 || ' hours')::interval)`,
          [uid[key], `Sample notification for ${p.code}`, `/projects/${p.id}`, p.id, rnd() > 0.6, String(Math.floor(rnd() * 120))],
        );
  });

  console.log(`\nSeeded ${USERS.length} users, ${PROJECTS.length} projects, ${docCount} documents (${revCount} revisions).`);
  console.log(`Demo logins (password for all: ${DEMO_PASSWORD}):`);
  USERS.forEach((u) => console.log(`  ${u.role.padEnd(16)} ${u.email}`));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
