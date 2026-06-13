-- 0027_company_contacts_scope_limit.sql — per-company contact-scope cap.
-- The "Scope contacts" action requests up to `contacts_scope_limit` people from Clay (default 100).
-- The company page compares the synced contact count to this cap: when count >= cap, it shows a
-- "more may be available" indicator + a one-click "Sync more" that re-scopes with a higher limit.
alter table public.companies add column if not exists contacts_scope_limit integer;
