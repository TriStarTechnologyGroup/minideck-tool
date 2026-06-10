-- 0013_scoring_model.sql — the global opportunity-scoring model weights, editable by admins.
-- The prospecting skill reads these (GET /api/prospecting/scoring-model) so edits take effect on
-- the next run/rescore; each opportunity's stored breakdown reflects the weights used at run time.
-- RLS: authenticated SELECT; writes via service role (admin route).

create table if not exists public.scoring_model (
  id          uuid primary key default gen_random_uuid(),
  component   text unique not null,
  weight_max  integer not null,
  description text,
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);

insert into public.scoring_model (component, weight_max, description, sort_order) values
  ('Target ↔ marker overlap', 40, 'Program target matches a pre-characterized TriStar IHC/molecular marker', 0),
  ('Matching TMA SKU',         25, 'A ready TMA SKU carries the program target / design (marker-matched)',      1),
  ('Tumor-type coverage',      15, 'Tumor type is in TriStar''s covered solid set',                              2),
  ('Translational window',     10, 'Early-stage AND not approved (the gate)',                                    3),
  ('Modality → capability fit',10, 'Modality maps to a TriStar assay bundle (antibody/ADC/IO etc.)',             4)
on conflict (component) do nothing;

alter table public.scoring_model enable row level security;
drop policy if exists "scoring_model_select_authenticated" on public.scoring_model;
create policy "scoring_model_select_authenticated" on public.scoring_model for select to authenticated using (true);
