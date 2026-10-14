-- Accounts and cloud saves for Cretaceous Nest.
-- Run once in Supabase > SQL Editor (or with `supabase db push`).

-- ---------- profiles ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 32),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Players read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Players update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- every new account gets a profile row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- saves ----------
-- One save per player, stored as the same JSON the game keeps in the browser.
-- Phase 3 replaces this with server-checked tables before anything is sold.
create table if not exists public.saves (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  data         jsonb not null check (pg_column_size(data) < 262144),
  save_version int not null,
  updated_at   timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "Players read their own save"
  on public.saves for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Players create their own save"
  on public.saves for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Players update their own save"
  on public.saves for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- account deletion ----------
-- Deleting the auth user cascades to the profile and the save.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
