-- Per-user "last viewed the Hot leads page" timestamp, so /leads can badge
-- engagements that are new since the user last looked. Written server-side
-- (service role) on each /leads render; readable under the existing select policy.
alter table public.profiles add column if not exists leads_seen_at timestamptz;
