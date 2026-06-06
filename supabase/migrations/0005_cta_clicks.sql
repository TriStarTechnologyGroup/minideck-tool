-- 0005_cta_clicks.sql
-- Capture deck CTA clicks (Book a meeting / Inquire / etc.) per link — the strongest
-- intent signal. Populated by /api/ingest from track.js cta beacons.

alter table public.link_engagement
  add column if not exists cta_clicks         jsonb not null default '{}'::jsonb, -- { "cta_book_meeting": 2, ... }
  add column if not exists booked_notified_at timestamptz;
