-- 0003_link_engagement.sql
-- True engaged time-on-page per link (Plausible can't scope session duration to a token).
-- Populated by the public /api/ingest endpoint from track.js beacons. Engaged time counts
-- only while the page is visible, so a left-open background tab does not inflate it.

create table if not exists public.link_engagement (
  token            text primary key references public.links (token) on delete cascade,
  deck_seconds     integer not null default 0,   -- engaged seconds on the deck (carousel)
  artifact_seconds integer not null default 0,   -- engaged seconds on the /data/ page
  per_slide        jsonb   not null default '{}'::jsonb,  -- { "<slug>": seconds }
  updated_at       timestamptz not null default now()
);

alter table public.link_engagement enable row level security;

-- Read: any authenticated internal user. Writes happen only via the service-role /api/ingest.
drop policy if exists "link_engagement_select_authenticated" on public.link_engagement;
create policy "link_engagement_select_authenticated"
  on public.link_engagement for select to authenticated using (true);
