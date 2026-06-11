-- 0018_catalog_hubspot_product.sql — link each app catalog item to its HubSpot Product.
-- The app catalog is the source of truth for taxonomy; each row mirrors to a HubSpot product
-- (identity only, no price — pricing is per-deal). hubspot_product_id is the back-link; the
-- product also carries an `app_catalog_id` property (tma:<uuid> / cap:<uuid>) for reconcile.

alter table public.tma_catalog  add column if not exists hubspot_product_id text;
alter table public.capabilities add column if not exists hubspot_product_id text;
