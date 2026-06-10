-- 0014_tma_catalog_fields.sql — expand the TMA catalog with the full WooCommerce product
-- fields the team curates and filters on. SKU is the primary identifier (TA# stays associated).
-- All nullable; populated from the catalog export.

alter table public.tma_catalog
  add column if not exists images           text,     -- product image URL(s)
  add column if not exists position         integer,
  add column if not exists suitable_for_codex text,   -- CODEX / GeoMx / CosMx (Yes/No)
  add column if not exists gcp_dzi_file      text,     -- scanned slide (deep-zoom) path
  add column if not exists data_sheet        text,
  add column if not exists cancer            text,     -- primary cancer / tissue type
  add column if not exists follow_up_data    text,     -- Yes/No
  add column if not exists molecular_data    text,     -- Yes/No
  add column if not exists number_of_cores   text,     -- bucket, e.g. ">100", "31-40"
  add column if not exists number_of_donors  text,     -- bucket
  add column if not exists product_cat       text;     -- primary product category

create index if not exists tma_catalog_sku_idx on public.tma_catalog(sku);
create index if not exists tma_catalog_cancer_idx on public.tma_catalog(cancer);
create index if not exists tma_catalog_product_cat_idx on public.tma_catalog(product_cat);
