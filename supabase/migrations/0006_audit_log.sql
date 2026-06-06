-- 0006_audit_log.sql
-- Audit trail for admin/user/deck/link actions. Authenticated users can read; writes
-- happen only via the service role (logAudit helper from server routes).

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_email text,
  action      text not null,                 -- e.g. "user.create", "deck.delete", "link.create"
  target_type text,                          -- "user" | "deck" | "link" | ...
  target      text,                          -- human-readable target (email / slug / token)
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists "audit_select_authenticated" on public.audit_log;
create policy "audit_select_authenticated"
  on public.audit_log for select to authenticated using (true);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
