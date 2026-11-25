-- AWENUE SALES OS — Permanent Founder and CTO Super Admin Protection
-- Protects the primary Founder and CTO account from deletion, demotion, or deactivation.

-- 1. Ensure Founder and CTO job title and role
update public.profiles
set
  job_title = 'Founder and CTO',
  role = 'super_admin',
  is_active = true,
  updated_at = now()
where role = 'super_admin' and (job_title ilike '%founder%' or job_title ilike '%cto%');

-- 2. Trigger function to protect the Founder in public.profiles based on role & title attributes
create or replace function public.protect_permanent_founder_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Block deletion if user is Founder / CTO Super Admin
  if tg_op = 'DELETE' then
    if old.role = 'super_admin' and (old.job_title ilike '%founder%' or old.job_title ilike '%cto%') then
      raise exception 'CRITICAL SECURITY ERROR: The Founder and CTO account is permanently protected and cannot be deleted.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- Block demotion or deactivation
  if tg_op = 'UPDATE' then
    if old.role = 'super_admin' and (old.job_title ilike '%founder%' or old.job_title ilike '%cto%') then
      if new.role <> 'super_admin' then
        raise exception 'CRITICAL SECURITY ERROR: The Founder and CTO account cannot be demoted from super_admin.' using errcode = 'P0001';
      end if;
      if not new.is_active then
        raise exception 'CRITICAL SECURITY ERROR: The Founder and CTO account cannot be deactivated.' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_protect_permanent_founder_profile on public.profiles;
create trigger trg_protect_permanent_founder_profile
  before update or delete on public.profiles
  for each row execute function public.protect_permanent_founder_profile();

-- 3. Trigger function to protect the Founder in auth.users
create or replace function public.protect_permanent_founder_auth_user()
returns trigger language plpgsql security definer as $$
begin
  if exists (
    select 1 from public.profiles
    where id = old.id
      and role = 'super_admin'
      and (job_title ilike '%founder%' or job_title ilike '%cto%')
  ) then
    raise exception 'CRITICAL SECURITY ERROR: The Founder and CTO user is permanently protected in auth.users and cannot be removed.' using errcode = 'P0001';
  end if;
  return old;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    drop trigger if exists trg_protect_permanent_founder_auth_user on auth.users;
    create trigger trg_protect_permanent_founder_auth_user
      before delete on auth.users
      for each row execute function public.protect_permanent_founder_auth_user();
  end if;
exception
  when insufficient_privilege then
    null;
end $$;
