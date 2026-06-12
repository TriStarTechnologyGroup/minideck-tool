-- 0020_inbound_opportunity_link.sql — link each inbound inquiry to the opportunity drafted
-- from it. On sync the app auto-drafts an opportunity SHELL (company + asset anchored to the
-- inquiry + the RFQ cart as matched TMAs, run_label 'Inbound', unscored); the opportunity-finder
-- skill then qualifies/scores it (score_components, fit tier, capabilities) like any prospecting
-- opportunity, matched by asset_key = inbound:<inquiry id>.

alter table public.inbound_inquiries add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;
create index if not exists inbound_inquiries_opportunity_idx on public.inbound_inquiries(opportunity_id);
