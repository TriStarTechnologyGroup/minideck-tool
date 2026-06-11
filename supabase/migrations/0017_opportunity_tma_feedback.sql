-- 0017_opportunity_tma_feedback.sql — reviewer feedback on the AI-matched TMAs for an
-- opportunity, so the skill can hone its TMA matching over time.
--   verdict 'confirmed' — reviewer agrees this suggested TMA is a good match
--   verdict 'rejected'  — reviewer says it's a bad match (skill should stop suggesting / down-weight)
--   verdict 'added'     — reviewer added a catalog TMA the skill missed
-- Keyed by (opportunity_id, ta_number) so it SURVIVES re-ingest: ingest replaces the
-- skill-owned cohorts but never touches this table; the UI re-associates by TA#.
-- RLS: authenticated SELECT; writes via the service role behind a role-checked route.

create table if not exists public.opportunity_tma_feedback (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  ta_number      text not null,             -- stable TMA identity within the opportunity
  sku            text,
  label          text,                       -- display name (for reviewer-added rows)
  verdict        text not null check (verdict in ('confirmed','rejected','added')),
  note           text,
  added_by       uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists opp_tma_feedback_uniq on public.opportunity_tma_feedback(opportunity_id, ta_number);
create index if not exists opp_tma_feedback_opportunity_id_idx on public.opportunity_tma_feedback(opportunity_id);

alter table public.opportunity_tma_feedback enable row level security;
drop policy if exists "opp_tma_feedback_select_authenticated" on public.opportunity_tma_feedback;
create policy "opp_tma_feedback_select_authenticated" on public.opportunity_tma_feedback for select to authenticated using (true);
