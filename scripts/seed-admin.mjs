// Seed (or promote) an admin user. Run with:
//   node --env-file=.env.local scripts/seed-admin.mjs you@tristargroup.us
// Creates a confirmed auth user with a temp password (printed once), which fires the
// profiles trigger, then promotes that profile's role to 'admin'. Idempotent: if the
// user already exists it just promotes the role (no password change).

import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2] || process.env.ADMIN_EMAIL;

if (!url || !service) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email) {
  console.error("✗ Usage: node --env-file=.env.local scripts/seed-admin.mjs <email>");
  process.exit(1);
}

const h = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };

function tempPassword() {
  // 18 url-safe bytes + guaranteed symbol/case/digit for any password policy.
  return randomBytes(18).toString("base64url") + "aA1!";
}

async function findUserByEmail(addr) {
  // Admin list endpoint supports ?email= filter on recent versions; fall back to scan.
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: h });
  if (!r.ok) throw new Error(`list users ${r.status} ${await r.text()}`);
  const body = await r.json();
  const users = body.users || body;
  return users.find((u) => (u.email || "").toLowerCase() === addr.toLowerCase()) || null;
}

let userId;
let tempPw = null;

// 1. Create the user (confirmed) — or find it if it already exists.
const create = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ email, password: (tempPw = tempPassword()), email_confirm: true }),
});

if (create.ok) {
  userId = (await create.json()).id;
  console.log(`\x1b[32m✓\x1b[0m Created auth user ${email}`);
} else {
  const txt = await create.text();
  // Already registered → look it up and just promote.
  if (create.status === 422 || /already|exists|registered/i.test(txt)) {
    const existing = await findUserByEmail(email);
    if (!existing) throw new Error(`User exists but could not be located: ${txt}`);
    userId = existing.id;
    tempPw = null;
    console.log(`• User ${email} already exists — promoting role only.`);
  } else {
    console.error(`✗ Create user failed: ${create.status} ${txt}`);
    process.exit(1);
  }
}

// 2. Promote the profile to admin (service role bypasses RLS).
const patch = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
  method: "PATCH",
  headers: { ...h, Prefer: "return=representation" },
  body: JSON.stringify({ role: "admin" }),
});
if (!patch.ok) {
  console.error(`✗ Promote failed: ${patch.status} ${await patch.text()}`);
  console.error("  (Did the profiles migration run? Try apply-migrations.mjs first.)");
  process.exit(1);
}
const rows = await patch.json();
if (!rows.length) {
  console.error("✗ No profile row found to promote — trigger may not have created it.");
  process.exit(1);
}

console.log(`\x1b[32m✓\x1b[0m ${email} is now role=admin`);
if (tempPw) {
  console.log(`\n  Temporary password (change on first login):\n    ${tempPw}\n`);
}
