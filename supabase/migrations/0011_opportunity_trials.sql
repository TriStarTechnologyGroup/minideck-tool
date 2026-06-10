-- 0011_opportunity_trials.sql — ClinicalTrials.gov evidence per opportunity. The skill
-- captures the relevant trial fields (incl. biospecimen-relevant signals) during research
-- and ingests them here so the opportunity page can show the clinical context that drives
-- a BD conversation. RLS: authenticated SELECT, service-role writes.

create table if not exists public.opportunity_trials (
  id                       uuid primary key default gen_random_uuid(),
  opportunity_id           uuid not null references public.opportunities(id) on delete cascade,
  nct_id                   text,
  title                    text,
  status                   text,
  phase                    text,
  enrollment               integer,
  start_date               text,
  primary_completion_date  text,
  conditions               text,                -- indications / cohorts
  interventions            text,                -- combination regimen
  primary_endpoints        text,
  tissue_requirements      text,                -- e.g. "Pre- & on-treatment biopsy required"
  selection_biomarkers     text,                -- e.g. "MSS, pMMR, PD-L1"
  relevance_flags          text,                -- skill-computed TriStar hooks (comma-sep)
  has_results              boolean not null default false,
  url                      text,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now()
);

create index if not exists opportunity_trials_opportunity_id_idx on public.opportunity_trials(opportunity_id);

alter table public.opportunity_trials enable row level security;
drop policy if exists "opportunity_trials_select_authenticated" on public.opportunity_trials;
create policy "opportunity_trials_select_authenticated" on public.opportunity_trials for select to authenticated using (true);
