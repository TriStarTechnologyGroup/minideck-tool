-- 0002_core_schema.sql
-- Core tables: decks, contacts, links (planning.md §6).
--
-- RLS strategy: every authenticated internal user may SELECT all rows (single shared
-- team). There are NO client write policies — all inserts/updates/deletes go through
-- server API routes using the service-role key (which bypasses RLS), where the caller's
-- role is enforced (admin for deck CRUD). SELECT-only RLS means the browser's public
-- key cannot write directly, which is the most locked-down stance.

-- Shared helper: bump updated_at on row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── decks ──────────────────────────────────────────────────────────────────
create table if not exists public.decks (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  base_url           text not null,                 -- e.g. https://hbs.tristargroup.us
  slug               text not null unique,          -- e.g. "hbs" (Plausible prop + label)
  thumbnail_url      text,                          -- Supabase Storage public URL
  plausible_site_id  text not null,                 -- the deck's Plausible site (domain)
  archived           boolean not null default false,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists decks_set_updated_at on public.decks;
create trigger decks_set_updated_at
  before update on public.decks
  for each row execute function public.set_updated_at();

-- ── contacts ───────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text not null,
  position     text,
  company      text,
  email        text not null,
  hubspot_id   text,                                -- id returned by HubSpot upsert
  hubspot_url  text,                                -- deep link to the record
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  unique (email)
);

-- ── links ──────────────────────────────────────────────────────────────────
create table if not exists public.links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,                -- 8-char nanoid
  deck_id      uuid not null references public.decks (id) on delete cascade,
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  full_url     text not null,                       -- base_url + "/?t=" + token
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  unique (deck_id, contact_id)                      -- one link per contact per deck
);

create index if not exists links_deck_id_idx on public.links (deck_id);
create index if not exists links_contact_id_idx on public.links (contact_id);

-- ── RLS: authenticated SELECT-all; writes via service role only ──────────────
alter table public.decks enable row level security;
alter table public.contacts enable row level security;
alter table public.links enable row level security;

drop policy if exists "decks_select_authenticated" on public.decks;
create policy "decks_select_authenticated"
  on public.decks for select to authenticated using (true);

drop policy if exists "contacts_select_authenticated" on public.contacts;
create policy "contacts_select_authenticated"
  on public.contacts for select to authenticated using (true);

drop policy if exists "links_select_authenticated" on public.links;
create policy "links_select_authenticated"
  on public.links for select to authenticated using (true);
