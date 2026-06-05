// Data-semantics check for the contacts/links fast path (service role).
// Verifies: contact upsert-by-email, one-link-per-(deck,contact) uniqueness (the reuse
// guarantee), and token uniqueness. Cleans up the throwaway contact afterward.
//   node --env-file=.env.local scripts/test-fastpath.mjs
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const rest = (p, opt = {}) => fetch(`${url}/rest/v1/${p}`, { headers: h, ...opt });
const TEST_EMAIL = "fastpath-test@example.invalid";
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${msg}`); if (!cond) ok = false; };

// deck
const deck = (await (await rest("decks?slug=eq.hbs&select=id,base_url")).json())[0];
check(!!deck, `found hbs deck (${deck?.id})`);

// upsert contact by email (insert then "upsert" again with changed name)
await rest(`contacts?email=eq.${TEST_EMAIL}`, { method: "DELETE" });
let c = (await (await rest("contacts", { method: "POST", headers: { ...h, Prefer: "return=representation" }, body: JSON.stringify({ first_name: "Fast", last_name: "Path", email: TEST_EMAIL }) })).json())[0];
check(!!c?.id, `created contact (${c?.id})`);

const up = await rest(`contacts?on_conflict=email`, { method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ email: TEST_EMAIL, first_name: "Fast2", last_name: "Path" }) });
const c2 = (await up.json())[0];
check(c2.id === c.id, "upsert by email kept same contact id (no duplicate)");

// link 1
const tok1 = "TESTaaaa";
const l1res = await rest("links", { method: "POST", headers: { ...h, Prefer: "return=representation" }, body: JSON.stringify({ token: tok1, deck_id: deck.id, contact_id: c.id, full_url: `${deck.base_url}/?t=${tok1}` }) });
check(l1res.ok, `created first link (${l1res.status})`);

// link 2 for same (deck, contact) → must be rejected (unique deck_id,contact_id)
const l2res = await rest("links", { method: "POST", headers: h, body: JSON.stringify({ token: "TESTbbbb", deck_id: deck.id, contact_id: c.id, full_url: `${deck.base_url}/?t=TESTbbbb` }) });
check(l2res.status === 409, `2nd link for same (deck,contact) rejected → ${l2res.status} (expect 409)`);

// duplicate token → rejected
const tokres = await rest("links", { method: "POST", headers: h, body: JSON.stringify({ token: tok1, deck_id: deck.id, contact_id: c.id, full_url: "x" }) });
check(tokres.status === 409, `duplicate token rejected → ${tokres.status} (expect 409)`);

// cleanup (cascade deletes the link)
const del = await rest(`contacts?email=eq.${TEST_EMAIL}`, { method: "DELETE" });
check(del.ok, "cleaned up test contact (+cascade link)");
const remaining = (await (await rest(`links?token=eq.${tok1}&select=id`)).json()).length;
check(remaining === 0, "link cascade-deleted with contact");

console.log(ok ? "\n\x1b[32m✓ fast-path semantics OK\x1b[0m" : "\n\x1b[31m✗ some checks failed\x1b[0m");
process.exit(ok ? 0 : 1);
