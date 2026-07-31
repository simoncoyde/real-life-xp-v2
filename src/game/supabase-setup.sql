-- ============================================================================
-- Real-Life XP — database setup
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- saves: one row per player, holding their whole game state as JSON.
-- ---------------------------------------------------------------------------
create table if not exists public.saves (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  revision   integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

-- Each policy is scoped to auth.uid(), so a signed-in account can only ever
-- touch its own row. This — not key secrecy — is what protects player data.
drop policy if exists "read own save" on public.saves;
create policy "read own save"
  on public.saves for select
  using (auth.uid() = user_id);

drop policy if exists "insert own save" on public.saves;
create policy "insert own save"
  on public.saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own save" on public.saves;
create policy "update own save"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own save" on public.saves;
create policy "delete own save"
  on public.saves for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- profiles: the small, public-facing slice. Kept separate from `saves` so a
-- leaderboard or friend list can show a name and level without any account
-- exposing its full history, settings or personal notes.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text,
  total_xp       bigint not null default 0,
  longest_streak integer not null default 0,
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Readable by any signed-in user (this is what makes leaderboards possible),
-- writable only by its owner.
drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create index if not exists profiles_total_xp_idx
  on public.profiles (total_xp desc);

-- ---------------------------------------------------------------------------
-- Sanity check: should return two rows, both with rowsecurity = true.
-- ---------------------------------------------------------------------------
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('saves', 'profiles');
