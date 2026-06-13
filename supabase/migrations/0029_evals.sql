-- 0029_evals.sql — in-app eval engine: app-managed golden datasets (authored in-app or via CSV),
-- runs, and per-example results. Powers the model bench + the eval suites. Designed so the UI has
-- clean empty / building / ready / running / scored states.

-- A golden dataset for one decision area + scorer type.
create table if not exists public.eval_datasets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  area        text not null,            -- e.g. company_type, org_classify, company_fit, people_fit,
                                         -- inbound_match, opportunity_validity, touch_quality, dedup_match
  eval_type   text not null check (eval_type in ('classification','match','judge','assertion')),
  description text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists eval_datasets_area_idx on public.eval_datasets(area);

-- One labeled case. `input` = the case fed to the model; `expected` = the gold answer
-- (null until labeled). Status drives the "building" progress UX.
create table if not exists public.eval_examples (
  id         uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.eval_datasets(id) on delete cascade,
  input      jsonb not null default '{}'::jsonb,
  expected   jsonb,
  status     text not null default 'unlabeled' check (status in ('unlabeled','labeled','skipped')),
  source     text,                       -- manual | csv | candidate
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists eval_examples_dataset_idx on public.eval_examples(dataset_id);
create index if not exists eval_examples_status_idx on public.eval_examples(dataset_id, status);

-- One eval run (a dataset scored against a model). Bench runs share a bench_group.
create table if not exists public.eval_runs (
  id          uuid primary key default gen_random_uuid(),
  dataset_id  uuid not null references public.eval_datasets(id) on delete cascade,
  model       text,
  status      text not null default 'queued' check (status in ('queued','running','done','error')),
  metrics     jsonb,                      -- {accuracy, n, correct, by_class, avg_latency_ms, cost_usd, ...}
  n_examples  integer,
  n_scored    integer,
  bench_group uuid,                       -- groups the per-model runs of one bench comparison
  error       text,
  created_by  uuid references public.profiles(id) on delete set null,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists eval_runs_dataset_idx on public.eval_runs(dataset_id, created_at desc);
create index if not exists eval_runs_bench_idx on public.eval_runs(bench_group);

-- Per-example outcome within a run.
create table if not exists public.eval_results (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.eval_runs(id) on delete cascade,
  example_id uuid references public.eval_examples(id) on delete set null,
  predicted  jsonb,
  passed     boolean,
  score      numeric,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists eval_results_run_idx on public.eval_results(run_id);

alter table public.eval_datasets enable row level security;
alter table public.eval_examples enable row level security;
alter table public.eval_runs enable row level security;
alter table public.eval_results enable row level security;
drop policy if exists "eval_datasets_sel" on public.eval_datasets;
create policy "eval_datasets_sel" on public.eval_datasets for select to authenticated using (true);
drop policy if exists "eval_examples_sel" on public.eval_examples;
create policy "eval_examples_sel" on public.eval_examples for select to authenticated using (true);
drop policy if exists "eval_runs_sel" on public.eval_runs;
create policy "eval_runs_sel" on public.eval_runs for select to authenticated using (true);
drop policy if exists "eval_results_sel" on public.eval_results;
create policy "eval_results_sel" on public.eval_results for select to authenticated using (true);
