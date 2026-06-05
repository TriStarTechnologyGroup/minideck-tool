// HubSpot connectivity + scope check. node --env-file=.env.local scripts/check-hubspot.mjs
const token = process.env.HUBSPOT_TOKEN;
const portal = process.env.HUBSPOT_PORTAL_ID;
function ok(m) { console.log(`\x1b[32m✓\x1b[0m ${m}`); }
function bad(m) { console.log(`\x1b[31m✗\x1b[0m ${m}`); }
if (!token) { bad("HUBSPOT_TOKEN not set"); process.exit(1); }

const auth = { Authorization: `Bearer ${token}` };
let failures = 0;

// 1. Token introspection — returns hub_id + granted scopes (works for pat- tokens).
try {
  const r = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${token}`);
  if (r.ok) {
    const info = await r.json();
    ok(`Token valid — hub_id ${info.hub_id}`);
    if (portal && String(info.hub_id) !== String(portal)) {
      bad(`HUBSPOT_PORTAL_ID (${portal}) != token hub_id (${info.hub_id})`); failures++;
    } else if (portal) ok(`Portal ID matches (${portal})`);

    const scopes = info.scopes || [];
    for (const need of ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.notes.write"]) {
      if (scopes.includes(need)) ok(`scope ${need}`);
      else { bad(`MISSING scope ${need}`); failures++; }
    }
  } else {
    bad(`Token introspection ${r.status} — will rely on the live calls below`);
  }
} catch (e) { bad(`introspection failed: ${e.message}`); }

// 2. Live read (contacts.read).
try {
  const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", { headers: auth });
  if (r.ok) ok("contacts read OK (GET /crm/v3/objects/contacts)");
  else { bad(`contacts read ${r.status}: ${(await r.text()).slice(0, 200)}`); failures++; }
} catch (e) { bad(`contacts read failed: ${e.message}`); failures++; }

console.log("");
if (failures === 0) ok("HubSpot ready.");
else { bad(`${failures} issue(s) — fix scopes/token then re-run.`); process.exit(1); }
