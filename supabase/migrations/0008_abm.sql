-- 0008_abm.sql — Account-based-marketing layer: campaigns → accounts → touches.
-- Account links are ordinary rows in public.links (with account_id), so track.js,
-- /api/ingest, stats, and alerts keep working unchanged. RLS mirrors existing tables:
-- any authenticated user may SELECT; all writes go through the service role.

create table if not exists public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  deck_id      uuid not null references public.decks(id) on delete restrict,
  sender_label text,
  status       text not null default 'active' check (status in ('active','archived')),
  cadence      jsonb not null default '[{"seq":1,"label":"Touch 1","day_offset":0},{"seq":2,"label":"Touch 2","day_offset":4},{"seq":3,"label":"Touch 3","day_offset":9}]',
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  name         text not null,
  warmth       text not null default 'warm' check (warmth in ('hot','warm','light')),
  research     text,
  context      text,
  angle        text,
  link_id      uuid references public.links(id) on delete set null,
  started_at   timestamptz,
  status       text not null default 'active' check (status in ('active','won','closed','archived')),
  created_at   timestamptz not null default now(),
  unique (campaign_id, name)
);

create table if not exists public.account_contacts (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  role         text not null default 'to' check (role in ('to','cc')),
  is_primary   boolean not null default false,
  unique (account_id, contact_id)
);

create table if not exists public.touches (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  seq          int not null,
  day_offset   int not null,
  subject      text,
  body         text,
  status       text not null default 'draft' check (status in ('draft','sent','skipped')),
  sent_at      timestamptz,
  unique (account_id, seq)
);

alter table public.links add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists accounts_campaign_id_idx on public.accounts(campaign_id);
create index if not exists account_contacts_account_id_idx on public.account_contacts(account_id);
create index if not exists touches_account_id_idx on public.touches(account_id);
create index if not exists links_account_id_idx on public.links(account_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.campaigns enable row level security;
alter table public.accounts enable row level security;
alter table public.account_contacts enable row level security;
alter table public.touches enable row level security;

drop policy if exists "campaigns_select_authenticated" on public.campaigns;
create policy "campaigns_select_authenticated" on public.campaigns for select to authenticated using (true);
drop policy if exists "accounts_select_authenticated" on public.accounts;
create policy "accounts_select_authenticated" on public.accounts for select to authenticated using (true);
drop policy if exists "account_contacts_select_authenticated" on public.account_contacts;
create policy "account_contacts_select_authenticated" on public.account_contacts for select to authenticated using (true);
drop policy if exists "touches_select_authenticated" on public.touches;
create policy "touches_select_authenticated" on public.touches for select to authenticated using (true);
