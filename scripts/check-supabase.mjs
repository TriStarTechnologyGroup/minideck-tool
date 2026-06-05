// Quick Supabase connectivity check. Run with:
//   node --env-file=.env.local scripts/check-supabase.mjs
// Verifies: URL reachable, anon/publishable key valid (auth health),
// service/secret key valid (lists Storage buckets), and the deck-thumbnails bucket.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

function ok(m) { console.log(`\x1b[32m✓\x1b[0m ${m}`); }
function bad(m) { console.log(`\x1b[31m✗\x1b[0m ${m}`); }

if (!url || !anon || !service) {
  bad("Missing one of NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
console.log(`Project: ${url}\n`);

let failures = 0;

// 1. Auth health (also exercises the anon/publishable key)
try {
  const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } });
  if (r.ok) ok(`Auth health OK (anon/publishable key accepted) — ${r.status}`);
  else { bad(`Auth health returned ${r.status}`); failures++; }
} catch (e) {
  bad(`Could not reach ${url}/auth/v1/health — ${e.message}`); failures++;
}

// 2. Service key — list Storage buckets
try {
  const r = await fetch(`${url}/storage/v1/bucket`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (!r.ok) {
    bad(`Storage bucket list returned ${r.status} (service/secret key may be wrong)`); failures++;
  } else {
    const buckets = await r.json();
    ok(`Service/secret key accepted — ${buckets.length} bucket(s)`);
    const thumb = buckets.find((b) => b.name === "deck-thumbnails");
    if (thumb) ok(`Bucket "deck-thumbnails" exists (public: ${thumb.public})`);
    else { bad(`Bucket "deck-thumbnails" NOT found — create it in Storage`); failures++; }
  }
} catch (e) {
  bad(`Storage check failed — ${e.message}`); failures++;
}

console.log("");
if (failures === 0) ok("All Supabase checks passed.");
else { bad(`${failures} check(s) failed.`); process.exit(1); }
