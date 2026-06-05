// Apply all supabase/migrations/*.sql in order via the Supabase Management API.
// Run with:  node --env-file=.env.local scripts/apply-migrations.mjs
// Requires SUPABASE_ACCESS_TOKEN (sbp_...) and NEXT_PUBLIC_SUPABASE_URL.
// Migrations are written idempotently, so re-running is safe.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "supabase", "migrations");

const pat = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!pat) {
  console.error("✗ SUPABASE_ACCESS_TOKEN is not set in .env.local");
  process.exit(1);
}
const ref = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!ref) {
  console.error(`✗ Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL=${url}`);
  process.exit(1);
}

async function runSql(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  return text;
}

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.log("No migrations found.");
  process.exit(0);
}

console.log(`Project ${ref} — applying ${files.length} migration(s):\n`);
for (const f of files) {
  const sql = await readFile(join(migrationsDir, f), "utf8");
  try {
    await runSql(sql);
    console.log(`\x1b[32m✓\x1b[0m ${f}`);
  } catch (e) {
    console.error(`\x1b[31m✗\x1b[0m ${f}\n  ${e.message}`);
    process.exit(1);
  }
}
console.log("\n\x1b[32m✓\x1b[0m All migrations applied.");
