-- 0031_fit_match_datasets.sql — scaffold the fit (LLM-judge) and match datasets so they appear in
-- /admin/evals in the "empty — no golden set yet" state, ready for labeling (in-app or CSV). No
-- examples: these are the golden sets the team will build over the coming days. Idempotent (fixed ids).

insert into public.eval_datasets (id, name, area, eval_type, description) values
  ('00000000-0000-4000-8000-000000000b01', 'Company ICP fit', 'company_fit', 'judge', 'Is this company a strong ICP fit for TriStar outbound? LLM-judge vs human gold verdicts.'),
  ('00000000-0000-4000-8000-000000000b02', 'People ICP fit', 'people_fit', 'judge', 'Is this person a decision-maker ICP (translational / BD / companion dx / pathology)?'),
  ('00000000-0000-4000-8000-000000000b03', 'Opportunity validity', 'opportunity_validity', 'judge', 'Is the generated opportunity valid and credible (matched assets fit, no fabrication)?'),
  ('00000000-0000-4000-8000-000000000b04', 'Touch quality', 'touch_quality', 'judge', 'Is the outbound email touch on-brand, specific, credible, and grounded (no hype/fabrication)?'),
  ('00000000-0000-4000-8000-000000000b05', 'Inbound match (offline)', 'inbound_match', 'match', 'Do the matched TMAs/capabilities for an inquiry match the gold set? F1 over input.predicted vs expected.items until a live matcher is registered.'),
  ('00000000-0000-4000-8000-000000000b06', 'Company dedup match (offline)', 'dedup_match', 'match', 'Do dedup candidates match the gold set? F1 over input.predicted vs expected.items.')
on conflict (id) do nothing;
