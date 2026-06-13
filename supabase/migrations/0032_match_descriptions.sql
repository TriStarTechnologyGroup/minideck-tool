-- 0032_match_descriptions.sql — the inbound_match + dedup_match datasets now have live matchers
-- registered in evals.ts (dedup mirrors the production dedup rule; inbound is a deterministic catalog
-- keyword baseline). Refresh their descriptions to match reality.

update public.eval_datasets
  set description = 'Live matcher: keyword overlap of the inquiry vs the TMA catalog (a deterministic baseline / floor to compare the LLM skill against). F1 vs the gold set.'
  where id = '00000000-0000-4000-8000-000000000b05';

update public.eval_datasets
  set description = 'Live matcher: mirrors the production dedup rule (normalized domain OR company name) against the companies table. F1 vs the gold set of true duplicates.'
  where id = '00000000-0000-4000-8000-000000000b06';
