-- 0028_llm_infra.sql — model registry + LLM-call logging (foundation for the model selector,
-- cost tracker, and model bench).
--
-- model_config: per-AREA model selection (default Opus 4.8), editable from the admin Settings page.
-- Each in-app LLM call resolves its model via getModelFor(area) so models are swappable per feature.
create table if not exists public.model_config (
  area       text primary key,                 -- 'org_classify' | 'company_type' | 'inbound_match' | 'touch_editor' | 'reply_draft' | 'eval_judge'
  model      text not null default 'claude-opus-4-8',
  effort     text,                              -- optional: low|medium|high|xhigh|max
  updated_at timestamptz not null default now()
);

insert into public.model_config (area, model) values
  ('org_classify',  'claude-opus-4-8'),
  ('company_type',  'claude-opus-4-8'),
  ('inbound_match', 'claude-opus-4-8'),
  ('touch_editor',  'claude-opus-4-8'),
  ('reply_draft',   'claude-opus-4-8'),
  ('eval_judge',    'claude-opus-4-8')
on conflict (area) do nothing;

-- llm_calls: one row per Anthropic call — feeds the cost tracker + model bench + drift monitoring.
create table if not exists public.llm_calls (
  id            uuid primary key default gen_random_uuid(),
  area          text,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  cost_usd      numeric,
  latency_ms    integer,
  ok            boolean not null default true,
  error         text,
  ref           text,                            -- optional correlation (e.g. inquiry/company/touch id)
  created_at    timestamptz not null default now()
);
create index if not exists llm_calls_area_created_idx on public.llm_calls(area, created_at desc);
create index if not exists llm_calls_created_idx on public.llm_calls(created_at desc);

alter table public.model_config enable row level security;
alter table public.llm_calls enable row level security;
drop policy if exists "model_config_select_authenticated" on public.model_config;
create policy "model_config_select_authenticated" on public.model_config for select to authenticated using (true);
drop policy if exists "llm_calls_select_authenticated" on public.llm_calls;
create policy "llm_calls_select_authenticated" on public.llm_calls for select to authenticated using (true);
