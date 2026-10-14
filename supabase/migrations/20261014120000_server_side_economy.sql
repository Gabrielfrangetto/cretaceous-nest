-- Phase 3: only the game server (the `game` Edge Function) writes saves.
-- Run once in Supabase > SQL Editor, after the first migration.

-- ---------- saves become read-only for players ----------
alter table public.saves add column if not exists revision bigint not null default 0;

drop policy if exists "Players create their own save" on public.saves;
drop policy if exists "Players update their own save" on public.saves;
-- "Players read their own save" stays: the game can still show a player their own save.

-- ---------- ledger: every coin and item gained or spent ----------
create table if not exists public.ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null,
  coins      integer not null default 0,
  items      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ledger_user_created on public.ledger (user_id, created_at desc);

alter table public.ledger enable row level security;

drop policy if exists "Players read their own history" on public.ledger;
create policy "Players read their own history"
  on public.ledger for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- write a save and its ledger entry in one transaction ----------
-- p_revision is the revision the server read; if another request wrote in between, nothing is
-- written and null comes back so the server can read again and retry. A null p_revision creates
-- the save.
create or replace function public.write_save(
  p_user uuid, p_revision bigint, p_data jsonb, p_version int,
  p_action text, p_coins int, p_items jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_revision bigint;
begin
  if p_revision is null then
    insert into public.saves (user_id, data, save_version, revision, updated_at)
    values (p_user, p_data, p_version, 1, now())
    on conflict (user_id) do nothing
    returning revision into new_revision;
  else
    update public.saves
       set data = p_data, save_version = p_version, revision = revision + 1, updated_at = now()
     where user_id = p_user and revision = p_revision
    returning revision into new_revision;
  end if;

  if new_revision is null then
    return null;
  end if;

  if p_coins <> 0 or p_items <> '{}'::jsonb then
    insert into public.ledger (user_id, action, coins, items) values (p_user, p_action, p_coins, p_items);
  end if;

  return new_revision;
end;
$$;

revoke all on function public.write_save(uuid, bigint, jsonb, int, text, int, jsonb) from public, anon, authenticated;
grant execute on function public.write_save(uuid, bigint, jsonb, int, text, int, jsonb) to service_role;
