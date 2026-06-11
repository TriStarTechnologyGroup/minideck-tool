-- 0015_opportunity_asset_key.sql — stable dedup identity for opportunities.
-- Refresh/replace previously matched on the raw display string (`asset_name`), which drifts
-- between runs ("Budigalimab" vs "Budigalimab (ABBV-181)") → exact-match misses → duplicate
-- + orphaned rows. `asset_key` is a normalized identity (see assetKey() in
-- src/lib/prospecting.ts) the server matches on instead.
--
-- This migration only ADDS the (nullable) column. Existing rows are backfilled + de-duplicated
-- by scripts/backfill-asset-keys.mjs, which must run BEFORE 0016 adds the unique index — else
-- the constraint fails on pre-existing duplicates.

alter table public.opportunities add column if not exists asset_key text;
