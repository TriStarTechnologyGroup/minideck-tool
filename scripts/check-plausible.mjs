// Plausible Stats API v2 check. node --env-file=.env.local scripts/check-plausible.mjs
const key = process.env.PLAUSIBLE_API_KEY;
if (!key) { console.log("\x1b[31m✗\x1b[0m PLAUSIBLE_API_KEY not set"); process.exit(1); }

const SITES = ["hbs.tristargroup.us", "ai-cohorts.tristargroup.us"];
let failures = 0;

for (const site of SITES) {
  const r = await fetch("https://plausible.io/api/v2/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ site_id: site, metrics: ["visitors", "pageviews"], date_range: "30d" }),
  });
  const txt = await r.text();
  if (r.ok) {
    const j = JSON.parse(txt);
    const row = j.results?.[0]?.metrics ?? [];
    console.log(`\x1b[32m✓\x1b[0m ${site} — visitors=${row[0]} pageviews=${row[1]} (last 30d)`);
  } else {
    console.log(`\x1b[31m✗\x1b[0m ${site} — ${r.status}: ${txt.slice(0, 200)}`);
    failures++;
  }
}

// Also confirm a token-filtered breakdown query is accepted (shape the app will use).
const probe = await fetch("https://plausible.io/api/v2/query", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    site_id: SITES[0],
    metrics: ["visitors", "visits", "pageviews", "visit_duration", "bounce_rate"],
    date_range: "30d",
    filters: [["is", "event:props:token", ["PROBE123"]]],
  }),
});
console.log(
  probe.ok
    ? "\x1b[32m✓\x1b[0m token-filtered query shape accepted (event:props:token)"
    : `\x1b[31m✗\x1b[0m token-filtered query rejected — ${probe.status}: ${(await probe.text()).slice(0, 200)}`,
);
if (!probe.ok) failures++;

console.log(failures === 0 ? "\n\x1b[32m✓ Plausible Stats API ready\x1b[0m" : `\n\x1b[31m✗ ${failures} issue(s)\x1b[0m`);
process.exit(failures ? 1 : 0);
