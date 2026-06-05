// Verify DB objects via the Management API. node --env-file=.env.local scripts/verify-db.mjs
const pat = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return JSON.parse(await r.text());
}

console.log("tables:", await q(
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('profiles','decks','contacts','links') order by table_name",
));
console.log("rls (relrowsecurity all true):", await q(
  "select relname, relrowsecurity from pg_class where relname in ('profiles','decks','contacts','links') and relnamespace='public'::regnamespace order by relname",
));
console.log("policies:", await q(
  "select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename",
));
console.log("unique/fk constraints:", await q(
  "select conrelid::regclass::text as tbl, conname, contype from pg_constraint where connamespace='public'::regnamespace and contype in ('u','f') order by tbl, conname",
));
console.log("decks_updated_at_trigger:", await q(
  "select tgname from pg_trigger where tgrelid='public.decks'::regclass and not tgisinternal",
));
console.log("profiles:", await q("select email, role from public.profiles order by created_at"));
