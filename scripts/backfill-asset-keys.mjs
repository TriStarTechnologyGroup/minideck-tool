// Backfill opportunities.asset_key and de-duplicate naming-drift collisions, so the
// 0016 UNIQUE (company_id, asset_key) index can be applied safely.
//
//   node --env-file=.env.local scripts/backfill-asset-keys.mjs          # dry run (report only)
//   node --env-file=.env.local scripts/backfill-asset-keys.mjs --apply  # make changes
//
// For each (company_id, asset_key) collision it keeps the richest row (reviewer feedback >
// score-component count > cohorts+trials > most recent) and deletes the others (children
// cascade). Run BEFORE migration 0016. Idempotent — safe to re-run.

const pat = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const APPLY = process.argv.includes("--apply");

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`query failed: ${t}`);
  return JSON.parse(t);
}

// Keep in sync with assetKey() in src/lib/prospecting.ts.
function assetKey(name) {
  let s = (name || "").toString().toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)\b/g, " ");
  s = s.replace(/[®™]/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "-");
  return s;
}

const rows = await q(`
  select o.id, o.company_id, o.asset_name, o.created_at,
         (select count(*) from opportunity_score_components s where s.opportunity_id=o.id) as comps,
         (select count(*) from opportunity_cohorts ch where ch.opportunity_id=o.id)
           + (select count(*) from opportunity_trials tr where tr.opportunity_id=o.id) as evidence,
         exists(select 1 from opportunity_feedback f where f.opportunity_id=o.id) as has_feedback
  from opportunities o`);

const groups = new Map();
for (const r of rows) {
  const k = `${r.company_id}::${assetKey(r.asset_name)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const score = (r) => [r.has_feedback ? 1 : 0, Number(r.comps), Number(r.evidence), Date.parse(r.created_at) || 0];
const better = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b; return a; };

const toDelete = [];
let collisions = 0;
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  collisions++;
  const keeper = g.reduce(better);
  const losers = g.filter((r) => r.id !== keeper.id);
  const lostFeedback = losers.filter((r) => r.has_feedback);
  if (lostFeedback.length) console.warn(`  ⚠ ${k}: ${lostFeedback.length} loser(s) carry feedback that will be dropped (keeper feedback=${keeper.has_feedback})`);
  console.log(`  ${k}: keep ${keeper.asset_name} [${keeper.id.slice(0, 8)}], drop ${losers.map((l) => l.asset_name).join(", ")}`);
  toDelete.push(...losers.map((l) => l.id));
}

console.log(`\n${rows.length} opportunities, ${collisions} collision group(s), ${toDelete.length} row(s) to delete.`);

if (!APPLY) { console.log("\nDry run — re-run with --apply to backfill + dedupe."); process.exit(0); }

if (toDelete.length) {
  const del = await q(`delete from opportunities where id in (${toDelete.map((id) => `'${id}'`).join(",")}) returning id`);
  console.log(`Deleted ${del.length} duplicate row(s).`);
}

// Backfill asset_key on every surviving row in one statement.
const survivors = rows.filter((r) => !toDelete.includes(r.id));
const values = survivors.map((r) => `('${r.id}'::uuid, '${assetKey(r.asset_name).replace(/'/g, "''")}')`).join(",");
if (values.length) {
  await q(`update public.opportunities as o set asset_key = v.k from (values ${values}) as v(id, k) where o.id = v.id`);
  console.log(`Backfilled asset_key on ${survivors.length} row(s).`);
}

// Verify no remaining collisions before the unique index is applied.
const dupes = await q(`select company_id, asset_key, count(*) c from public.opportunities where asset_key is not null group by company_id, asset_key having count(*) > 1`);
console.log(dupes.length ? `\n❌ ${dupes.length} collision(s) REMAIN — do not apply 0016 yet.` : `\n✓ No remaining (company_id, asset_key) collisions — safe to apply migration 0016.`);
