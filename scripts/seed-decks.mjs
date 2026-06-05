// Seed the two real decks (idempotent upsert by slug) and capture thumbnails.
//   node --env-file=.env.local scripts/seed-decks.mjs
// Mirrors the app's screenshot flow (Microlink -> deck-thumbnails bucket).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const shotKey = process.env.SCREENSHOT_API_KEY || "";
if (!url || !service) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const h = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const BUCKET = "deck-thumbnails";

const DECKS = [
  { name: "HBS", base_url: "https://hbs.tristargroup.us", slug: "hbs", plausible_site_id: "hbs.tristargroup.us" },
  { name: "AI Cohorts", base_url: "https://ai-cohorts.tristargroup.us", slug: "ai-cohorts", plausible_site_id: "ai-cohorts.tristargroup.us" },
];

// Admin id for created_by (optional).
let createdBy = null;
{
  const r = await fetch(`${url}/rest/v1/profiles?role=eq.admin&select=id&limit=1`, { headers: h });
  const rows = await r.json();
  createdBy = rows?.[0]?.id ?? null;
}

async function captureAndStore(slug, target) {
  const params = new URLSearchParams({
    url: target, screenshot: "true", meta: "false",
    "viewport.width": "1280", "viewport.height": "800", type: "png",
  });
  const headers = shotKey ? { "x-api-key": shotKey } : {};
  const mres = await fetch(`https://api.microlink.io/?${params}`, { headers });
  if (!mres.ok) return null;
  const json = await mres.json();
  const shotUrl = json?.data?.screenshot?.url;
  if (!shotUrl) return null;
  const img = await fetch(shotUrl);
  if (!img.ok) return null;
  const bytes = Buffer.from(await img.arrayBuffer());
  const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${slug}.png`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: bytes,
  });
  if (!up.ok) { console.warn(`  storage upload ${up.status}: ${await up.text()}`); return null; }
  return `${url}/storage/v1/object/public/${BUCKET}/${slug}.png?v=${Date.now()}`;
}

for (const d of DECKS) {
  // upsert by slug
  const r = await fetch(`${url}/rest/v1/decks?on_conflict=slug`, {
    method: "POST",
    headers: { ...h, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...d, created_by: createdBy }),
  });
  if (!r.ok) { console.error(`✗ ${d.slug}: ${r.status} ${await r.text()}`); continue; }
  const [row] = await r.json();
  console.log(`\x1b[32m✓\x1b[0m upserted ${d.slug} (${row.id})`);

  process.stdout.write(`  capturing thumbnail… `);
  const thumb = await captureAndStore(d.slug, d.base_url);
  if (thumb) {
    await fetch(`${url}/rest/v1/decks?id=eq.${row.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ thumbnail_url: thumb }) });
    console.log("done");
  } else {
    console.log("skipped (capture failed — re-capture in the UI)");
  }
}
console.log("\n\x1b[32m✓\x1b[0m Deck seed complete.");
