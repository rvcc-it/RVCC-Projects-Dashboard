// Starts a local, embedded PostgreSQL server for development & testing (no Docker required).
// Data lives in ./.pgdata  -  Usage: npm run db:local
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.env.PGPORT || 54329);
const dataDir = path.resolve(process.cwd(), process.env.PGDATA_DIR || ".pgdata");
const dbName = process.env.PGDATABASE || "rvcc_portal";
const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase(dbName);
console.log(`\nPostgreSQL ready ->  postgresql://postgres:postgres@localhost:${port}/${dbName}\n(Ctrl+C to stop)`);

const stop = async () => { try { await pg.stop(); } finally { process.exit(0); } };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
