// Live HubSpot write test: upsert a throwaway contact, attach a note, verify, clean up.
//   node --env-file=.env.local scripts/test-hubspot.mjs
const token = process.env.HUBSPOT_TOKEN;
const portal = process.env.HUBSPOT_PORTAL_ID;
const BASE = "https://api.hubapi.com";
const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const TEST_EMAIL = "minideck-hubspot-test@example.com";
let ok = true;
const log = (c, m) => { console.log(`${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${m}`); if (!c) ok = false; };

// 1. Upsert contact (search → create or update)
let contactId;
const search = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
  method: "POST", headers: h,
  body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: TEST_EMAIL }] }], properties: ["email"], limit: 1 }),
});
const found = search.ok ? (await search.json()).results?.[0] : null;
const props = { email: TEST_EMAIL, firstname: "Minideck", lastname: "Test", jobtitle: "QA", company: "Example" };
if (found) {
  contactId = found.id;
  log(true, `contact already existed (${contactId}) — reusing`);
} else {
  const c = await fetch(`${BASE}/crm/v3/objects/contacts`, { method: "POST", headers: h, body: JSON.stringify({ properties: props }) });
  log(c.ok, `create contact → ${c.status}${c.ok ? "" : " " + (await c.text()).slice(0, 160)}`);
  if (!c.ok) { console.log(ok ? "" : "\n\x1b[31m✗ contacts.write scope missing?\x1b[0m"); process.exit(1); }
  contactId = (await c.json()).id;
}

// 2. Create a note associated to the contact (note→contact = type 202)
const note = await fetch(`${BASE}/crm/v3/objects/notes`, {
  method: "POST", headers: h,
  body: JSON.stringify({
    properties: { hs_note_body: `Minideck link (Test): https://hbs.tristargroup.us/?t=TESTtest — created ${new Date().toISOString().slice(0, 10)} by admin@tristargroup.us`, hs_timestamp: new Date().toISOString() },
    associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  }),
});
log(note.ok, `create note + association → ${note.status}${note.ok ? "" : " " + (await note.text()).slice(0, 200)}`);
let noteId = null;
if (note.ok) noteId = (await note.json()).id;

// 3. Verify the note→contact association
if (noteId) {
  const assoc = await fetch(`${BASE}/crm/v4/objects/notes/${noteId}/associations/contacts`, { headers: h });
  const linked = assoc.ok ? (await assoc.json()).results?.some((r) => String(r.toObjectId) === String(contactId)) : false;
  log(linked, "note is associated to the contact");
}

console.log(`  portal URL: https://app.hubspot.com/contacts/${portal}/contact/${contactId}`);

// 4. Cleanup (archive note + contact)
if (noteId) { const d = await fetch(`${BASE}/crm/v3/objects/notes/${noteId}`, { method: "DELETE", headers: h }); log(d.ok || d.status === 204, `cleaned up note → ${d.status}`); }
const dc = await fetch(`${BASE}/crm/v3/objects/contacts/${contactId}`, { method: "DELETE", headers: h });
log(dc.ok || dc.status === 204, `cleaned up contact → ${dc.status}`);

console.log(ok ? "\n\x1b[32m✓ HubSpot write path OK (contacts.write + notes.write)\x1b[0m" : "\n\x1b[31m✗ some checks failed\x1b[0m");
process.exit(ok ? 0 : 1);
