-- 0033_inbound_quotes.sql — one quote draft per inbound inquiry. Line items are pulled from the
-- inquiry's requested products (mapped to the TMA catalog), with unit prices pre-filled from the
-- HubSpot deal line items when available and editable by the reviewer (there is no standing price
-- list in the app). One quote per inquiry (regenerating replaces its line items).

create table if not exists public.inbound_quotes (
  id          uuid primary key default gen_random_uuid(),
  inquiry_id  uuid not null unique references public.inbound_inquiries(id) on delete cascade,
  currency    text not null default 'USD',
  line_items  jsonb not null default '[]'::jsonb,   -- [{sku, name, ta_number, quantity, unit_price, note}]
  notes       text,
  status      text not null default 'draft' check (status in ('draft','sent')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists inbound_quotes_inquiry_idx on public.inbound_quotes(inquiry_id);

alter table public.inbound_quotes enable row level security;
drop policy if exists "inbound_quotes_sel" on public.inbound_quotes;
create policy "inbound_quotes_sel" on public.inbound_quotes for select to authenticated using (true);
