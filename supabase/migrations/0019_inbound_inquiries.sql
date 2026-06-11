-- 0019_inbound_inquiries.sql — inbound RFQ + contact-form inquiries synced from HubSpot.
-- RFQ inquiries come from deals (both pipelines) + their line items (the cart); contact-form
-- inquiries from the "Contact Us" form. The HubSpot pipeline classifies RFQs (Pharma & Biotech
-- = industry, Academic = academia); contact-form orgs are classified in-app via Claude.
-- prospect_eligible = industry only. RLS: authenticated SELECT; writes via service-role routes.
--
-- NOTE: the agreed UNIQUE(sku) guard on tma_catalog is NOT here — 4 duplicate-SKU rows exist;
-- it ships with that dedup later (the index would fail to create while dups remain).

create table if not exists public.inbound_inquiries (
  id                    uuid primary key default gen_random_uuid(),
  source                text not null check (source in ('rfq','contact_form')),
  hubspot_object_type   text,                 -- 'deal' | 'form_submission'
  hubspot_object_id     text,                 -- deal id / submission id (dedupe key)
  hubspot_contact_id    text,
  company_name          text,
  company_domain        text,
  contact_name          text,
  contact_email         text,
  subject               text,                 -- e.g. the "How can we help" category
  message               text,
  requested_products    jsonb,                -- RFQ cart: [{sku, name, quantity, hubspot_product_id}]
  pipeline              text,                 -- HubSpot pipeline id (RFQ)
  stage                 text,                 -- HubSpot deal stage id
  amount                numeric,              -- deal total
  classification        text not null default 'unknown' check (classification in ('industry','academia','non_profit','government','other','unknown')),
  classification_reason text,
  prospect_eligible     boolean not null default false,  -- industry → eligible for full prospecting
  status                text not null default 'new' check (status in ('new','classified','replied','quoted','prospected','closed_won','closed_lost','ignored')),
  company_id            uuid references public.companies(id) on delete set null,  -- set when prospected
  received_at           timestamptz,
  synced_at             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists inbound_inquiries_hs_obj_uniq on public.inbound_inquiries(hubspot_object_type, hubspot_object_id) where hubspot_object_id is not null;
create index if not exists inbound_inquiries_status_idx on public.inbound_inquiries(status);
create index if not exists inbound_inquiries_classification_idx on public.inbound_inquiries(classification);
create index if not exists inbound_inquiries_received_idx on public.inbound_inquiries(received_at desc);

alter table public.inbound_inquiries enable row level security;
drop policy if exists "inbound_inquiries_select_authenticated" on public.inbound_inquiries;
create policy "inbound_inquiries_select_authenticated" on public.inbound_inquiries for select to authenticated using (true);
