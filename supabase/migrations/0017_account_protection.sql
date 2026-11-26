-- Account protection: an explicit flag (not job titles) that makes a person's account permanent.
-- Protected accounts can't be deleted, deactivated, demoted, or have their sign-in email changed, by anyone, including Super Admins.
-- Only the database owner (SQL Editor) can add or remove protection, via set_account_protection().

alter table public.profiles add column if not exists is_permanent boolean not null default false;

-- Nobody with a signed-in session can change the flag. Only the owner's SQL Editor session (no auth.uid()) can.
create or replace function public.guard_permanent_flag() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_permanent is distinct from old.is_permanent and auth.uid() is not null then
    raise exception 'Account protection can only be changed by the database owner.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists guard_permanent_flag on public.profiles;
create trigger guard_permanent_flag before update of is_permanent on public.profiles
  for each row execute function public.guard_permanent_flag();

-- Replaces the job-title check from 0014.
create or replace function public.protect_permanent_founder_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_permanent then raise exception 'This account is permanently protected and cannot be deleted.' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.is_permanent then
    if new.role <> 'super_admin' then raise exception 'This account is permanently protected and cannot be demoted.' using errcode = 'P0001'; end if;
    if not new.is_active then raise exception 'This account is permanently protected and cannot be deactivated.' using errcode = 'P0001'; end if;
    if new.workspace_id is distinct from old.workspace_id then raise exception 'This account is permanently protected and cannot be moved.' using errcode = 'P0001'; end if;
    if new.email is distinct from old.email and auth.uid() is not null then
      raise exception 'This account is permanently protected. Its sign-in email cannot be changed.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- Replaces the auth-user check from 0014: the sign-in account of a protected person can't be deleted.
create or replace function public.protect_permanent_founder_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = old.id and is_permanent) then
    raise exception 'This account is permanently protected and its sign-in cannot be removed.' using errcode = 'P0001';
  end if;
  return old;
end $$;

-- Owner-only: add or remove protection by email address.
create or replace function public.set_account_protection(p_email text, p_on boolean) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.profiles set is_permanent = p_on where lower(email) = lower(p_email);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Expected one account for %, found %.', p_email, n; end if;
  return format('%s is now %s', p_email, case when p_on then 'permanently protected' else 'unprotected' end);
end $$;
revoke all on function public.set_account_protection(text, boolean) from public, anon, authenticated;

-- Protect the two founders by name. Each name must match exactly one account, otherwise nothing is changed for that name.
do $$
declare nm text; n int; em text;
begin
  foreach nm in array array['Ashutosh Chatterjee', 'Diksha Dubey'] loop
    select count(*), max(email) into n, em from public.profiles where full_name = nm;
    if n = 1 then
      update public.profiles set is_permanent = true, role = 'super_admin', is_active = true where full_name = nm;
      raise notice 'Protected % (%)', nm, em;
    else
      raise notice 'Not protected: % matches % accounts. Run select set_account_protection(email, true) for the right one.', nm, n;
    end if;
  end loop;
end $$;
