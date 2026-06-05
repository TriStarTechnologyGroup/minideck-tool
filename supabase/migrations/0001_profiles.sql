-- 0001_profiles.sql
-- Profiles extend auth.users with an app role. Single shared internal team:
-- any authenticated user may READ all profiles; all WRITES go through the
-- service role (signup trigger + admin seeding) — users cannot self-escalate.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Read: any authenticated internal user can see all profiles.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies → those are denied for anon/authenticated.
-- The trigger below runs as SECURITY DEFINER, and the service role bypasses RLS,
-- so profile creation and role changes happen only server-side.

-- Auto-create a profile row when a new auth user is created (role defaults to 'user').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill profiles for any users that already exist (idempotent).
insert into public.profiles (id, email, role)
select u.id, u.email, 'user'
from auth.users u
on conflict (id) do nothing;
