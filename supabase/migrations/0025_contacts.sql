-- 0025_contacts.sql — promote the existing `contacts` table (deck-share leads, from 0002) into the
-- unified people entity: a structured company link + enrichment/ICP fields, an opportunity↔contact
-- relevance join, and a backfill of inbound POCs. Reuses the existing columns (position = title,
-- hubspot_id = HubSpot contact id, email unique). Additive — existing leads/link flows keep working.

-- Allow partial records (enriched/inbound contacts may only have a full name).
alter table public.contacts alter column first_name drop not null;
alter table public.contacts alter column last_name  drop not null;

alter table public.contacts add column if not exists full_name         text;
alter table public.contacts add column if not exists company_id        uuid references public.companies(id) on delete set null;
alter table public.contacts add column if not exists seniority         text;
alter table public.contacts add column if not exists function          text;   -- maps to target_roles.function
alter table public.contacts add column if not exists is_decision_maker boolean not null default false;
alter table public.contacts add column if not exists linkedin_url      text;
alter table public.contacts add column if not exists location          text;
alter table public.contacts add column if not exists source            text;   -- 'lead' | 'inbound' | 'hubspot' | 'clay' | 'manual'
alter table public.contacts add column if not exists confidence        numeric;
alter table public.contacts add column if not exists enriched_at       timestamptz;
alter table public.contacts add column if not exists do_not_contact    boolean not null default false;  -- GDPR / opt-out
alter table public.contacts add column if not exists notes             text;
alter table public.contacts add column if not exists updated_at        timestamptz not null default now();

create index if not exists contacts_company_idx on public.contacts(company_id);
create index if not exists contacts_function_idx on public.contacts(function);

-- Derive full_name + link company_id for the existing rows.
update public.contacts set full_name = nullif(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') where full_name is null;
update public.contacts set source = 'lead' where source is null;
update public.contacts c set company_id = co.id
  from public.companies co
  where c.company_id is null and c.company is not null and lower(btrim(c.company)) = lower(btrim(co.name));
-- …and by email domain → company domain (catches inbound POCs whose company text didn't match).
update public.contacts c set company_id = co.id
  from public.companies co
  where c.company_id is null and c.email like '%@%' and co.domain is not null
    and lower(split_part(c.email, '@', 2)) = lower(btrim(co.domain));

-- opportunity ↔ contact relevance (which people matter to which opportunity).
create table if not exists public.opportunity_contacts (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  contact_id     uuid not null references public.contacts(id) on delete cascade,
  relevance      text,
  role           text,
  source         text,
  created_at     timestamptz not null default now(),
  unique (opportunity_id, contact_id)
);
create index if not exists opportunity_contacts_opp_idx on public.opportunity_contacts(opportunity_id);
create index if not exists opportunity_contacts_contact_idx on public.opportunity_contacts(contact_id);

alter table public.opportunity_contacts enable row level security;
drop policy if exists "opportunity_contacts_select_authenticated" on public.opportunity_contacts;
create policy "opportunity_contacts_select_authenticated" on public.opportunity_contacts for select to authenticated using (true);

-- Backfill inbound POCs (those with an email not already a contact), deduped by email.
insert into public.contacts (email, full_name, first_name, last_name, company_id, hubspot_id, source)
select distinct on (lower(i.contact_email))
  i.contact_email,
  i.contact_name,
  nullif(split_part(coalesce(i.contact_name, ''), ' ', 1), ''),
  nullif(btrim(regexp_replace(coalesce(i.contact_name, ''), '^\S+', '')), ''),
  i.company_id,
  i.hubspot_contact_id,
  'inbound'
from public.inbound_inquiries i
where i.contact_email is not null and btrim(i.contact_email) <> ''
  and not exists (select 1 from public.contacts c where lower(c.email) = lower(i.contact_email))
order by lower(i.contact_email), i.received_at desc nulls last
on conflict (email) do nothing;
