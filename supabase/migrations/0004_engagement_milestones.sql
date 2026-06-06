-- 0004_engagement_milestones.sql
-- Derived fields + alert de-dup flags on link_engagement, to drive HubSpot alerts,
-- write-back, the hot-leads dashboard, and the slide heatmap.

alter table public.link_engagement
  add column if not exists first_seen_at        timestamptz,
  add column if not exists furthest_index       integer not null default 0,
  add column if not exists reached_cta          boolean not null default false,
  add column if not exists opened_notified_at   timestamptz,
  add column if not exists cta_notified_at      timestamptz,
  add column if not exists artifact_notified_at timestamptz;

-- Helps the hot-leads dashboard order by recency.
create index if not exists link_engagement_updated_at_idx on public.link_engagement (updated_at desc);
