-- 0016_opportunity_asset_key_unique.sql — one opportunity per (company, asset_key).
-- This is the upsert conflict target used by ingestProspecting (onConflict
-- "company_id,asset_key") and what permanently stops naming-drift duplicates.
--
-- PRECONDITION on an existing DB: scripts/backfill-asset-keys.mjs must have already
-- backfilled asset_key and merged/removed duplicates, or this index creation fails.
-- (NULLs are distinct in a btree unique index, so legacy rows with a null company_id or
-- null asset_key do not collide.) On a fresh DB this is a no-op-safe empty-table index.

create unique index if not exists opportunities_company_asset_key_uniq
  on public.opportunities (company_id, asset_key);
