-- Accounts with a username and a password (the email confirmed before the first sign-in).
-- Run once in Supabase > SQL Editor, after the earlier migrations.

-- ---------- usernames ----------
-- 3 to 20 letters, digits or underscores; unique whatever the case ("Rex" and "rex" are one name)
alter table public.profiles add column if not exists username text
  check (username ~ '^[A-Za-z0-9_]{3,20}$');
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- every new account gets a profile row, with the username chosen at sign-up (kept in the account's
-- metadata until then; a name not fit to keep, or taken meanwhile, fails the sign-up instead)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  insert into public.profiles (id, username, display_name) values (new.id, name, name);
  return new;
end;
$$;

-- whether a username can still be had, asked before signing up (by players not signed in yet)
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select name ~ '^[A-Za-z0-9_]{3,20}$'
    and not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- an account made before usernames picks one, once
create or replace function public.claim_username(name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  perform set_config('nest.claiming_username', 'on', true);
  update public.profiles set username = name, display_name = coalesce(display_name, name)
    where id = auth.uid() and username is null;
  if not found then
    raise exception 'Username already set';
  end if;
end;
$$;

revoke all on function public.claim_username(text) from public;
grant execute on function public.claim_username(text) to authenticated;

-- the username is only set through the functions above, never by a plain update of the profile
create or replace function public.keep_username()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username is distinct from old.username
     and coalesce(current_setting('nest.claiming_username', true), '') <> 'on' then
    raise exception 'The username can only be chosen once';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_username on public.profiles;
create trigger keep_username
  before update on public.profiles
  for each row execute function public.keep_username();
