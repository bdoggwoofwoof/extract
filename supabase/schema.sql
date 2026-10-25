-- Extract: sync between devices and short share links.
-- Paste this whole file into Supabase → SQL Editor → New query, then Run. Safe to run again.

-- 1. Everything you save: recipes, books, planned days, the grocery list. One row each.
create table if not exists public.items (
  user_id    uuid    not null references auth.users on delete cascade,
  id         text    not null,
  kind       text    not null,
  data       jsonb   not null default '{}'::jsonb,
  updated_at bigint  not null,              -- when the change was made, from the device (ms)
  deleted    boolean not null default false, -- deletions sync too, so things don't come back
  server_at  timestamptz not null default now(), -- when the server got it; devices pull by this
  primary key (user_id, id)
);
create index if not exists items_user_server_at on public.items (user_id, server_at);

alter table public.items enable row level security;
drop policy if exists "people see and change only their own items" on public.items;
create policy "people see and change only their own items" on public.items
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.items_touch() returns trigger language plpgsql as $$
begin new.server_at = now(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.items_touch();

-- Devices push through this so an older change never overwrites a newer one.
create or replace function public.push_items(rows jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into public.items (user_id, id, kind, data, updated_at, deleted)
  select auth.uid(), r->>'id', r->>'kind', coalesce(r->'data', '{}'::jsonb),
         (r->>'updated_at')::bigint, coalesce((r->>'deleted')::boolean, false)
  from jsonb_array_elements(rows) as r
  on conflict (user_id, id) do update
    set kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
    where public.items.updated_at < excluded.updated_at;
$$;
revoke all on function public.push_items(jsonb) from public, anon;
grant execute on function public.push_items(jsonb) to authenticated;

-- Live updates: other devices hear about changes right away.
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- 2. Short share links. Anyone with a link can open that one share; nobody can list them.
create table if not exists public.shares (
  id         text primary key check (length(id) between 8 and 32),
  owner      uuid not null default auth.uid() references auth.users on delete cascade,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.shares enable row level security;
drop policy if exists "owners create shares" on public.shares;
create policy "owners create shares" on public.shares for insert to authenticated with check (auth.uid() = owner);
drop policy if exists "owners see their shares" on public.shares;
create policy "owners see their shares" on public.shares for select to authenticated using (auth.uid() = owner);
drop policy if exists "owners delete shares" on public.shares;
create policy "owners delete shares" on public.shares for delete to authenticated using (auth.uid() = owner);

create or replace function public.get_share(share_id text) returns jsonb
language sql security definer set search_path = public stable as $$
  select payload from public.shares where id = share_id;
$$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
