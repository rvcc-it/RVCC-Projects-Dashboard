// Visual smoke: logs in as admin and screenshots every main screen (light + dark + mobile).
// Usage: BASE_URL=http://localhost:3001 node tests/e2e/shots.mjs <outDir>
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3001";
const out = process.argv[2] || "./.shots";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

await page.goto(BASE + "/login");
await page.screenshot({ path: `${out}/01-login.png` });
await page.fill("#identifier", "admin@demo.rvcc.test");
await page.fill("#password", "Demo@12345");
await page.click("button[type=submit]");
await page.waitForURL(BASE + "/");
await page.waitForSelector("text=Projects by status");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/02-overview.png`, fullPage: true });

const first = await page.locator("a[href*='/projects/']:not([href$='/new'])").first().getAttribute("href");
const shots = [
  ["03-projects", "/projects"], ["04-project-detail", first], ["05-project-docs", first + "?tab=documents"], ["06-project-team", first + "?tab=team"],
  ["07-project-reports", first + "?tab=reports"], ["08-project-activity", first + "?tab=activity"], ["09-documents", "/documents"], ["10-reports", "/reports"],
  ["11-users", "/users"], ["12-roles", "/users?tab=roles"], ["13-notifications", "/notifications"], ["14-settings-cats", "/settings?tab=categories"],
  ["15-settings-system", "/settings?tab=system"], ["16-new-project", "/projects/new"],
];
for (const [name, path] of shots) {
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
// document detail with PDF
await page.goto(BASE + "/documents");
const docHref = await page.locator("a[href^='/documents/']").first().getAttribute("href");
await page.goto(BASE + docHref);
await page.waitForSelector("canvas", { timeout: 20000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/17-document-detail.png`, fullPage: true });
// dark + mobile
await page.goto(BASE + "/");
await page.evaluate(() => localStorage.setItem("theme", "dark"));
await page.reload();
await page.waitForSelector("text=Projects by status");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/18-overview-dark.png`, fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + "/");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/19-overview-mobile.png`, fullPage: false });
await page.goto(BASE + "/projects");
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/20-projects-mobile.png`, fullPage: false });
console.log("console/page errors:", errors.length ? errors : "none");
await browser.close();
