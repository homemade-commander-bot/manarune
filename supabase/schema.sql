-- Commander Forge — Supabase schema
-- Run this in the Supabase SQL editor against a fresh project.
-- Tables are scoped per user via Row Level Security (RLS) so users can
-- only read/write their own decks.

-- ======================================================================
-- profiles: 1:1 with auth.users
-- ======================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Planeswalker',
  avatar text not null default '🧙',
  preferred_colors text[] not null default '{}',
  favorite_themes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profile_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profile_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profile_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ======================================================================
-- decks: each row is one deck owned by exactly one user.
-- The deck blob (entries, themes, notes) is stored as jsonb because the
-- shape mirrors the Deck type in src/lib/types.ts and we never query
-- inside it server-side.
-- ======================================================================
create table if not exists public.decks (
  id text primary key,                          -- client-generated id
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  commander_id text,
  partner_id text,
  data jsonb not null,                          -- full Deck object
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decks_user_id_idx on public.decks(user_id);
create index if not exists decks_updated_at_idx on public.decks(user_id, updated_at desc);

alter table public.decks enable row level security;

create policy "deck_select_own"
  on public.decks for select
  using (auth.uid() = user_id);

create policy "deck_insert_own"
  on public.decks for insert
  with check (auth.uid() = user_id);

create policy "deck_update_own"
  on public.decks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "deck_delete_own"
  on public.decks for delete
  using (auth.uid() = user_id);

-- ======================================================================
-- collection_groups: user-defined sub-collections (Main / Trade binder /
-- Tergrid pile, etc.). Always at least the "default" group per user;
-- created on the client and inserted here.
-- ======================================================================
create table if not exists public.collection_groups (
  id text not null,                             -- client-generated
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists collection_groups_user_idx on public.collection_groups(user_id);

alter table public.collection_groups enable row level security;

create policy "collection_groups_select_own"
  on public.collection_groups for select
  using (auth.uid() = user_id);

create policy "collection_groups_insert_own"
  on public.collection_groups for insert
  with check (auth.uid() = user_id);

create policy "collection_groups_update_own"
  on public.collection_groups for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "collection_groups_delete_own"
  on public.collection_groups for delete
  using (auth.uid() = user_id);

-- ======================================================================
-- collection_entries: per-printing rows of the user's owned cards.
-- Keyed by Scryfall card.id so different printings (Beta vs M11
-- Lightning Bolt) are tracked independently. Per-group quantities
-- live inside the jsonb data blob (groupQuantities) since the shape
-- mirrors the CollectionEntry type in src/lib/types.ts and we never
-- query inside it server-side.
-- ======================================================================
create table if not exists public.collection_entries (
  card_id text not null,                        -- Scryfall card.id
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,                          -- full CollectionEntry
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index if not exists collection_entries_user_idx on public.collection_entries(user_id);
create index if not exists collection_entries_updated_idx
  on public.collection_entries(user_id, updated_at desc);

alter table public.collection_entries enable row level security;

create policy "collection_select_own"
  on public.collection_entries for select
  using (auth.uid() = user_id);

create policy "collection_insert_own"
  on public.collection_entries for insert
  with check (auth.uid() = user_id);

create policy "collection_update_own"
  on public.collection_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "collection_delete_own"
  on public.collection_entries for delete
  using (auth.uid() = user_id);
