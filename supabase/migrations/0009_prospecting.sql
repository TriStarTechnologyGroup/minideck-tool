-- 0009_prospecting.sql — Pipeline-prospecting layer: the qualification engine's
-- system of record. The Claude prospecting skill stays the research + scoring brain;
-- it logs its output here so opportunities become queryable and actionable (→ campaigns).
-- RLS mirrors existing tables: any authenticated user may SELECT; writes via service role.

-- The prospecting universe (HubSpot company dump + per-run company profiles).
create table if not exists public.companies (
  id                     uuid primary key default gen_random_uuid(),
  hubspot_id             text unique,
  name                   text not null,
  domain                 text,
  website                text,
  industry               text,
  type                   text,
  lifecycle_stage        text,
  owner                  text,
  employees              integer,
  annual_revenue         bigint,
  city                   text,
  state                  text,
  country                text,
  year_founded           integer,
  relevant               boolean not null default false,  -- "company of relevance" flag
  pipeline_program_count integer not null default 0,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Oncology drug programs (the enriched pipeline dataset; pipeline-build output).
create table if not exists public.drug_programs (
  id                  uuid primary key default gen_random_uuid(),
  program_ref         text,                       -- the skill's "Program ID" (e.g. PRG-00001)
  company_id          uuid references public.companies(id) on delete cascade,
  company_name        text not null,
  asset_name          text not null,
  modality            text,
  target              text,
  mechanism_of_action text,
  highest_phase       text,
  indications         text,
  combination_partners text,
  nct_ids             text,
  trial_count         integer,
  status_summary      text,
  tumor_types         text,
  solid_tumor         boolean,
  liquid_tumor        boolean,
  in_window           boolean,                    -- in the translational window
  proprietary         text,                       -- Proprietary / Combination partner / SOC
  data_source         text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Scored opportunities (opportunity-finder output) — one row per scored program per run.
create table if not exists public.opportunities (
  id                     uuid primary key default gen_random_uuid(),
  run_label              text,                    -- e.g. "Regeneron 2026-06-07"
  company_id             uuid references public.companies(id) on delete cascade,
  program_id             uuid references public.drug_programs(id) on delete set null,
  company_name           text not null,
  asset_name             text not null,
  modality               text,
  target                 text,
  phase                  text,
  tumor_types            text,
  fit_score              integer,
  fit_tier               text,                    -- "Tier 1 — strong fit" etc.
  proprietary            text,
  matched_tma_skus       text,                    -- skill output, e.g. "TA1167 [MET] | TA1248 …"
  suggested_capabilities text,
  rationale              text,
  notes                  text,
  created_at             timestamptz not null default now()
);

-- TriStar's TMA catalog (reference; read live by the skill, mirrored here for the UI).
create table if not exists public.tma_catalog (
  id                 uuid primary key default gen_random_uuid(),
  sku                text,
  ta_number          text,
  name               text,
  short_description  text,
  description        text,
  categories         text,
  donor_samples_each integer,
  approx_cores       integer,
  approx_donors      integer,
  core_size          text,
  markers            text,
  primary_categories text,
  suitable_for       text,
  created_at         timestamptz not null default now()
);

-- TriStar capabilities (reference).
create table if not exists public.capabilities (
  id            uuid primary key default gen_random_uuid(),
  capability_id text unique,                       -- e.g. CAP-01
  name          text not null,
  category      text,
  description   text
);

-- Tie an ABM account to its prospecting company profile (qualification → execution).
alter table public.accounts add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists drug_programs_company_id_idx on public.drug_programs(company_id);
create index if not exists opportunities_company_id_idx on public.opportunities(company_id);
create index if not exists opportunities_program_id_idx on public.opportunities(program_id);
create index if not exists opportunities_fit_tier_idx on public.opportunities(fit_tier);
create index if not exists tma_catalog_ta_number_idx on public.tma_catalog(ta_number);
create index if not exists companies_relevant_idx on public.companies(relevant);
create index if not exists accounts_company_id_idx on public.accounts(company_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.companies enable row level security;
alter table public.drug_programs enable row level security;
alter table public.opportunities enable row level security;
alter table public.tma_catalog enable row level security;
alter table public.capabilities enable row level security;

drop policy if exists "companies_select_authenticated" on public.companies;
create policy "companies_select_authenticated" on public.companies for select to authenticated using (true);
drop policy if exists "drug_programs_select_authenticated" on public.drug_programs;
create policy "drug_programs_select_authenticated" on public.drug_programs for select to authenticated using (true);
drop policy if exists "opportunities_select_authenticated" on public.opportunities;
create policy "opportunities_select_authenticated" on public.opportunities for select to authenticated using (true);
drop policy if exists "tma_catalog_select_authenticated" on public.tma_catalog;
create policy "tma_catalog_select_authenticated" on public.tma_catalog for select to authenticated using (true);
drop policy if exists "capabilities_select_authenticated" on public.capabilities;
create policy "capabilities_select_authenticated" on public.capabilities for select to authenticated using (true);
