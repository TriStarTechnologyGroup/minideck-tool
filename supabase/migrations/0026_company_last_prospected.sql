-- 0026_company_last_prospected.sql — track when a company was last fully prospected, to drive a
-- cost-conscious scheduled refresh. Bumped by the prospecting ingest on any NON-inbound run.
-- The /api/prospecting/refresh-queue endpoint returns VERIFIED + industry companies whose
-- last_prospected_at is null or stale, so a scheduled run only re-prospects accounts that matter.

alter table public.companies add column if not exists last_prospected_at timestamptz;
create index if not exists companies_last_prospected_idx on public.companies(last_prospected_at);
