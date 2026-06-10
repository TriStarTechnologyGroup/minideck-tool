-- 0010_opportunity_cohorts.sql — the per-opportunity matched-cohort lists (the
-- detailed TA#/markers/donors tables from the prospecting report's §5). Lets each
-- opportunity open into a full detail view. RLS: authenticated SELECT, service-role writes.

create table if not exists public.opportunity_cohorts (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  ta_number      text,
  cohort         text,
  markers        text,
  donors         integer,
  category       text,
  custom_stain   boolean not null default false, -- target marker not pre-run on this SKU
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists opportunity_cohorts_opportunity_id_idx on public.opportunity_cohorts(opportunity_id);

alter table public.opportunity_cohorts enable row level security;
drop policy if exists "opportunity_cohorts_select_authenticated" on public.opportunity_cohorts;
create policy "opportunity_cohorts_select_authenticated" on public.opportunity_cohorts for select to authenticated using (true);
