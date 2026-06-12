-- 0023_company_verified_flag.sql — curation signals on companies.
-- `verified` = a human has reviewed the company and confirmed it's absolutely relevant to TriStar's
-- business. Verified companies are the ones we auto-prospect on a schedule, whitelist in features,
-- and spend LLM tokens enriching. `flagged_for_removal` = queued for review/removal (soft signal;
-- actual delete stays a separate admin action). Archive, never hard-delete from automation.

alter table public.companies add column if not exists verified            boolean not null default false;
alter table public.companies add column if not exists verified_at         timestamptz;
alter table public.companies add column if not exists verified_by         uuid references public.profiles(id) on delete set null;
alter table public.companies add column if not exists flagged_for_removal  boolean not null default false;
alter table public.companies add column if not exists flag_reason         text;
alter table public.companies add column if not exists flagged_at          timestamptz;

create index if not exists companies_verified_idx on public.companies(verified) where verified;
create index if not exists companies_flagged_idx on public.companies(flagged_for_removal) where flagged_for_removal;
