// One-time: create the "Minideck" contact property group + engagement properties in HubSpot.
// Idempotent (ignores "already exists"). Run: node --env-file=.env.local scripts/setup-hubspot-properties.mjs
const token = process.env.HUBSPOT_TOKEN;
if (!token) { console.error("HUBSPOT_TOKEN not set"); process.exit(1); }
const BASE = "https://api.hubapi.com";
const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const GROUP = "minideck";
const props = [
  { name: "minideck_last_deck", label: "Minideck — Last deck viewed", type: "string", fieldType: "text" },
  { name: "minideck_last_viewed", label: "Minideck — Last viewed", type: "datetime", fieldType: "date" },
  { name: "minideck_slide_depth", label: "Minideck — Furthest slide", type: "number", fieldType: "number" },
  { name: "minideck_engaged_seconds", label: "Minideck — Engaged seconds", type: "number", fieldType: "number" },
  { name: "minideck_reached_cta", label: "Minideck — Reached CTA", type: "enumeration", fieldType: "booleancheckbox",
    options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }] },
  { name: "minideck_artifact_opened", label: "Minideck — Opened data page", type: "enumeration", fieldType: "booleancheckbox",
    options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }] },
  { name: "minideck_last_cta", label: "Minideck — Last CTA clicked", type: "string", fieldType: "text" },
];

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const skip = (m) => console.log(`• ${m}`);

// group
{
  const r = await fetch(`${BASE}/crm/v3/properties/contacts/groups`, {
    method: "POST", headers: h, body: JSON.stringify({ name: GROUP, label: "Minideck", displayOrder: -1 }),
  });
  if (r.ok) ok("created property group 'minideck'");
  else {
    const t = await r.text();
    if (/already exists/i.test(t)) skip("group exists");
    else console.log("group:", r.status, t.slice(0, 120));
  }
}

for (const p of props) {
  const r = await fetch(`${BASE}/crm/v3/properties/contacts`, {
    method: "POST", headers: h, body: JSON.stringify({ ...p, groupName: GROUP }),
  });
  if (r.ok) ok(`created ${p.name}`);
  else {
    const t = await r.text();
    if (/already exists/i.test(t)) skip(`${p.name} exists`);
    else console.log(`${p.name}:`, r.status, t.slice(0, 120));
  }
}
console.log("\nDone.");
