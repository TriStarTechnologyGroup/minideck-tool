-- 0021_company_type.sql — formalize companies.type as a constrained enum + sane default.
-- Type drives the new /companies directory and the default Pharma/Biotech filter on the companies
-- and prospecting tables. Seed the obvious types from the synced HubSpot `industry`
-- (Pharmaceuticals→Pharma, Biotechnology→Biotech); everything else starts 'Needs Type Defined' for
-- Claude classification (next phase). The enum: Pharma, Biotech, Early Stage Startup, Academia,
-- Non-Profit, Other, Needs Type Defined.

-- Seed from industry where unambiguous.
update public.companies set type = 'Pharma'  where (type is null or btrim(type) = '') and industry ilike 'pharmaceutical%';
update public.companies set type = 'Biotech' where (type is null or btrim(type) = '') and industry ilike 'biotech%';
-- Default the rest, and normalize any pre-existing free-text type values not in the enum.
update public.companies set type = 'Needs Type Defined'
 where type is null or btrim(type) = ''
    or type not in ('Pharma','Biotech','Early Stage Startup','Academia','Non-Profit','Other','Needs Type Defined');

alter table public.companies alter column type set default 'Needs Type Defined';
alter table public.companies alter column type set not null;

alter table public.companies drop constraint if exists companies_type_check;
alter table public.companies add constraint companies_type_check
  check (type in ('Pharma','Biotech','Early Stage Startup','Academia','Non-Profit','Other','Needs Type Defined'));

create index if not exists companies_type_idx on public.companies(type);
