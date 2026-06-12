-- 0024_target_roles.sql — ICP / decision-maker role definitions.
-- Defines the title archetypes TriStar wants to reach inside a customer org. Drives which contacts
-- we pull/enrich (Clay), how contact relevance is scored, and which people surface on opportunities.
-- Managed at /research/roles.

create table if not exists public.target_roles (
  id              uuid primary key default gen_random_uuid(),
  function        text not null,                 -- e.g. "Translational Medicine"
  title_keywords  text,                          -- comma-separated match terms
  seniority_floor text,                          -- e.g. "Director+"
  priority        integer not null default 0,    -- higher = more important to reach
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists target_roles_active_idx on public.target_roles(active);

alter table public.target_roles enable row level security;
drop policy if exists "target_roles_select_authenticated" on public.target_roles;
create policy "target_roles_select_authenticated" on public.target_roles for select to authenticated using (true);

-- Seed sensible oncology BD personas (idempotent: only when the table is empty).
insert into public.target_roles (function, title_keywords, seniority_floor, priority)
select * from (values
  ('Translational Medicine',          'translational, translational medicine, translational science',        'Director+', 90),
  ('Biomarkers',                      'biomarker, biomarkers, biomarker strategy',                            'Director+', 85),
  ('Companion Diagnostics / Precision Medicine', 'companion diagnostic, cdx, precision medicine, diagnostics', 'Director+', 80),
  ('Pathology',                       'pathology, pathologist, anatomic pathology',                           'Senior',    70),
  ('Computational / Digital Pathology / AI', 'computational pathology, digital pathology, machine learning, ai, image analysis', 'Manager+', 65),
  ('Discovery / Preclinical Oncology','discovery, preclinical, oncology research, target discovery',          'Director+', 60),
  ('Clinical Development (Oncology)',  'clinical development, medical director, clinical oncology',            'Director+', 55),
  ('Business Development / Licensing', 'business development, bd, licensing, alliance, partnering',            'Director+', 75),
  ('Executive (CSO / CMO / CEO)',      'chief scientific, cso, chief medical, cmo, ceo, vp r&d, head of r&d', 'VP+',       95)
) as v(function, title_keywords, seniority_floor, priority)
where not exists (select 1 from public.target_roles);
