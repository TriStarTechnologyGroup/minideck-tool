-- 0030_guardrail_seeds.sql — seed the four deterministic guardrail assertion datasets so they appear
-- (in the "ready" state) in /admin/evals immediately and can be run with zero API cost. The same
-- predicates are enforced in production (src/lib/guardrails.ts) and gated in CI (guardrails.test.ts).
-- Idempotent: datasets use fixed ids (ON CONFLICT DO NOTHING); examples insert only if absent.

insert into public.eval_datasets (id, name, area, eval_type, description) values
  ('00000000-0000-4000-8000-000000000a01', 'Guardrail — academia gate', 'academia_gate', 'assertion', 'Only industry orgs are prospect-eligible; academia / non-profit / government / unknown are outbound-only.'),
  ('00000000-0000-4000-8000-000000000a02', 'Guardrail — company suppression', 'company_suppression', 'assertion', 'Prospect only verified, unflagged industry companies; flagged-for-removal is always excluded.'),
  ('00000000-0000-4000-8000-000000000a03', 'Guardrail — Tier-1 (approved drug)', 'tier1_consistency', 'assertion', 'A company with an approved drug program must be a Tier-1 fit (advisory; tier is assigned by the skill).'),
  ('00000000-0000-4000-8000-000000000a04', 'Guardrail — PII redaction', 'pii_redaction', 'assertion', 'Text sent to the model / stored in drafts must not leak emails, phone numbers, or SSNs.')
on conflict (id) do nothing;

insert into public.eval_examples (dataset_id, input, expected, status, source)
select '00000000-0000-4000-8000-000000000a01'::uuid, v.input, v.expected, 'labeled', 'seed'
from (values
  ('{"category":"industry"}'::jsonb,   '{"label":"eligible"}'::jsonb),
  ('{"category":"academia"}'::jsonb,   '{"label":"blocked"}'::jsonb),
  ('{"category":"non_profit"}'::jsonb, '{"label":"blocked"}'::jsonb),
  ('{"category":"government"}'::jsonb, '{"label":"blocked"}'::jsonb),
  ('{"category":"unknown"}'::jsonb,    '{"label":"blocked"}'::jsonb),
  ('{"domain":"stanford.edu"}'::jsonb, '{"label":"blocked"}'::jsonb),
  ('{"domain":"nih.gov"}'::jsonb,      '{"label":"blocked"}'::jsonb)
) as v(input, expected)
where not exists (select 1 from public.eval_examples where dataset_id = '00000000-0000-4000-8000-000000000a01'::uuid);

insert into public.eval_examples (dataset_id, input, expected, status, source)
select '00000000-0000-4000-8000-000000000a02'::uuid, v.input, v.expected, 'labeled', 'seed'
from (values
  ('{"type":"Pharma","verified":true,"flagged_for_removal":false}'::jsonb,            '{"label":"prospectable"}'::jsonb),
  ('{"type":"Biotech","verified":true,"flagged_for_removal":false}'::jsonb,           '{"label":"prospectable"}'::jsonb),
  ('{"type":"Early Stage Startup","verified":true}'::jsonb,                            '{"label":"prospectable"}'::jsonb),
  ('{"type":"Pharma","verified":false,"flagged_for_removal":false}'::jsonb,           '{"label":"blocked"}'::jsonb),
  ('{"type":"Pharma","verified":true,"flagged_for_removal":true}'::jsonb,             '{"label":"blocked"}'::jsonb),
  ('{"type":"Academia","verified":true,"flagged_for_removal":false}'::jsonb,          '{"label":"blocked"}'::jsonb),
  ('{"type":"Non-Profit","verified":true}'::jsonb,                                     '{"label":"blocked"}'::jsonb)
) as v(input, expected)
where not exists (select 1 from public.eval_examples where dataset_id = '00000000-0000-4000-8000-000000000a02'::uuid);

insert into public.eval_examples (dataset_id, input, expected, status, source)
select '00000000-0000-4000-8000-000000000a03'::uuid, v.input, v.expected, 'labeled', 'seed'
from (values
  ('{"highest_phase":"Approved"}'::jsonb,     '{"label":"tier1"}'::jsonb),
  ('{"highest_phase":"FDA Approved"}'::jsonb, '{"label":"tier1"}'::jsonb),
  ('{"highest_phase":"Phase III"}'::jsonb,    '{"label":"not_tier1"}'::jsonb),
  ('{"highest_phase":"Phase I"}'::jsonb,      '{"label":"not_tier1"}'::jsonb),
  ('{"highest_phase":"Preclinical"}'::jsonb,  '{"label":"not_tier1"}'::jsonb)
) as v(input, expected)
where not exists (select 1 from public.eval_examples where dataset_id = '00000000-0000-4000-8000-000000000a03'::uuid);

insert into public.eval_examples (dataset_id, input, expected, status, source)
select '00000000-0000-4000-8000-000000000a04'::uuid, v.input, v.expected, 'labeled', 'seed'
from (values
  ('{"text":"Contact jane@acme-bio.com for samples"}'::jsonb,         '{"label":"clean"}'::jsonb),
  ('{"text":"Call 415-555-2671 to discuss the cohort"}'::jsonb,       '{"label":"clean"}'::jsonb),
  ('{"text":"SSN 123-45-6789 on file"}'::jsonb,                        '{"label":"clean"}'::jsonb),
  ('{"text":"Genmab is advancing an approved bispecific in DLBCL."}'::jsonb, '{"label":"clean"}'::jsonb)
) as v(input, expected)
where not exists (select 1 from public.eval_examples where dataset_id = '00000000-0000-4000-8000-000000000a04'::uuid);
