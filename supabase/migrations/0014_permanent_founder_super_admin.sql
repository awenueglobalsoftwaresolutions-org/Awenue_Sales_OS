-- AWENUE SALES OS — Permanent Founder & Root Super Admin Protection
-- Guarantees codewithsushil7236@gmail.com cannot be deleted, demoted, deactivated, or altered by any admin or super admin.

-- 1. Ensure profile record is set to Super Admin and Founder
update public.profiles
set
  full_name = 'Sushil Kumar kushwaha',
  job_title = 'Founder',
  role = 'super_admin',
  is_active = true,
  updated_at = now()
where lower(email) = 'codewithsushil7236@gmail.com';

-- 2. Trigger function to protect the Founder in public.profiles
create or replace function public.protect_permanent_founder_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Block deletion
  if tg_op = 'DELETE' then
    if lower(old.email) = 'codewithsushil7236@gmail.com' then
      raise exception 'CRITICAL SECURITY ERROR: The Root Founder and Permanent Super Admin account (codewithsushil7236@gmail.com) cannot be deleted from the database under any circumstances.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- Block demotion, deactivation or email change
  if tg_op = 'UPDATE' then
    if lower(old.email) = 'codewithsushil7236@gmail.com' then
      if new.role <> 'super_admin' then
        raise exception 'CRITICAL SECURITY ERROR: The Root Founder (codewithsushil7236@gmail.com) cannot be demoted from super_admin.' using errcode = 'P0001';
      end if;
      if not new.is_active then
        raise exception 'CRITICAL SECURITY ERROR: The Root Founder account cannot be deactivated.' using errcode = 'P0001';
      end if;
      if lower(new.email) <> 'codewithsushil7236@gmail.com' then
        raise exception 'CRITICAL SECURITY ERROR: The Root Founder email address is permanent and cannot be modified.' using errcode = 'P0001';
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
  if lower(old.email) = 'codewithsushil7236@gmail.com' then
    raise exception 'CRITICAL SECURITY ERROR: The Root Founder user (codewithsushil7236@gmail.com) is permanently protected in auth.users and cannot be removed.' using errcode = 'P0001';
  end if;
  return old;
end $$;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'auth' and tablename = 'users') then
    execute 'drop trigger if exists trg_protect_permanent_founder_auth_user on auth.users;';
    execute 'create trigger trg_protect_permanent_founder_auth_user before delete on auth.users for each row execute function public.protect_permanent_founder_auth_user();';
  end if;
exception when others then
  -- Ignore if auth schema trigger permissions are managed externally by Supabase
  null;
end $$;
