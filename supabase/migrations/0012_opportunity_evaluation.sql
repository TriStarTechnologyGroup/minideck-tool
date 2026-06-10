-- 0012_opportunity_evaluation.sql — scoring transparency + human-in-the-loop feedback.
--   opportunity_score_components: the skill's per-parameter breakdown (immutable).
--   opportunity_capabilities:     structured suggested/added capabilities with a confirm flag.
--   opportunity_feedback:         one reviewer-adjustment row per opportunity (non-destructive;
--                                 the opportunity's own fit_score is never overwritten).
-- RLS: authenticated SELECT; all writes via the service role behind role-checked routes.

create table if not exists public.opportunity_score_components (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  component      text not null,            -- e.g. "Target ↔ marker overlap"
  weight_max     integer not null,         -- e.g. 40
  points         integer not null,         -- skill-awarded points
  note           text,
  sort_order     integer not null default 0
);

create table if not exists public.opportunity_capabilities (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  capability_id  text,                     -- optional CAP-xx / L-0x id
  label          text not null,
  source         text not null default 'suggested' check (source in ('suggested','added')),
  confirmed      boolean not null default false,
  added_by       uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create table if not exists public.opportunity_feedback (
  id               uuid primary key default gen_random_uuid(),
  opportunity_id   uuid not null unique references public.opportunities(id) on delete cascade,
  reviewer_score   integer,                -- reviewer-adjusted total (alongside the skill score)
  component_points jsonb,                  -- { "<component>": points } reviewer overrides
  verdict          text check (verdict in ('agree','too_high','too_low','reject')),
  notes            text,
  updated_by       uuid references public.profiles(id),
  updated_at       timestamptz not null default now()
);

create index if not exists opp_score_components_opportunity_id_idx on public.opportunity_score_components(opportunity_id);
create index if not exists opp_capabilities_opportunity_id_idx on public.opportunity_capabilities(opportunity_id);

alter table public.opportunity_score_components enable row level security;
alter table public.opportunity_capabilities enable row level security;
alter table public.opportunity_feedback enable row level security;

drop policy if exists "opp_score_components_select_authenticated" on public.opportunity_score_components;
create policy "opp_score_components_select_authenticated" on public.opportunity_score_components for select to authenticated using (true);
drop policy if exists "opp_capabilities_select_authenticated" on public.opportunity_capabilities;
create policy "opp_capabilities_select_authenticated" on public.opportunity_capabilities for select to authenticated using (true);
drop policy if exists "opp_feedback_select_authenticated" on public.opportunity_feedback;
create policy "opp_feedback_select_authenticated" on public.opportunity_feedback for select to authenticated using (true);
