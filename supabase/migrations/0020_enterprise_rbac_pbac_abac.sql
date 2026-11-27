-- AWENUE SALES OS — Enterprise RBAC, PBAC, and ABAC Engine
-- Provides complete Super Admin control, permission-based overrides (PBAC), and attribute-based access control (ABAC).

-- ============ 1. CATALOG EXTENSIONS ============
insert into public.permissions (key, module, action, description)
select m.module || '.' || a, m.module, a, ''
from (values
  ('projects', array['view','create','edit','delete','manage','export','assign']),
  ('tickets', array['view','create','edit','delete','manage','assign','approve','export']),
  ('website_queries', array['view','edit','delete','manage','export','assign'])
) as m(module, actions), unnest(m.actions) as a
on conflict (key) do nothing;

-- ============ 2. PBAC: USER-LEVEL DIRECT PERMISSION OVERRIDES ============
create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission)
);
create index if not exists user_permissions_user_idx on public.user_permissions (user_id);
create index if not exists user_permissions_perm_idx on public.user_permissions (permission);

-- ============ 3. ABAC: ATTRIBUTE COLUMNS ON PROFILES ============
alter table public.profiles
  add column if not exists allowed_modules text[] default null,
  add column if not exists allowed_services text[] default null,
  add column if not exists record_scope text not null default 'all' check (record_scope in ('all', 'team', 'own')),
  add column if not exists export_allowed boolean not null default true;

-- ============ 4. BULLETPROOF PERMISSION EVALUATOR (RBAC + PBAC + ABAC) ============
create or replace function public.can_do_for(p_user uuid, p_module text, p_action text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  v_active boolean;
  v_allowed_modules text[];
  v_export_allowed boolean;
  v_action_effect text;
  v_manage_effect text;
begin
  if p_user is null then return false; end if;

  -- 1. Fetch user attributes
  select role, is_active, allowed_modules, export_allowed
    into v_role, v_active, v_allowed_modules, v_export_allowed
    from public.profiles where id = p_user;

  if not coalesce(v_active, false) then return false; end if;

  -- Super Admin is omnipotent: full access across all operations
  if v_role = 'super_admin' then return true; end if;

  -- 2. ABAC: Module whitelist check (immediate deny if module not whitelisted)
  if v_allowed_modules is not null and not (p_module = any(v_allowed_modules)) then
    return false;
  end if;

  -- 3. ABAC: Global export restriction (immediate deny if export disabled)
  if p_action = 'export' and not coalesce(v_export_allowed, true) then
    return false;
  end if;

  -- 4. PBAC: Check direct action override in user_permissions
  select effect into v_action_effect
    from public.user_permissions
   where user_id = p_user and permission = (p_module || '.' || p_action);

  -- An explicit action deny CANNOT be overridden by role or module manage!
  if v_action_effect = 'deny' then
    return false;
  elsif v_action_effect = 'allow' then
    return true;
  end if;

  -- 5. PBAC: Check module-wide manage override in user_permissions
  select effect into v_manage_effect
    from public.user_permissions
   where user_id = p_user and permission = (p_module || '.manage');

  if v_manage_effect = 'allow' and (p_action <> 'export' or coalesce(v_export_allowed, true)) then
    return true;
  end if;

  -- 6. RBAC: Role-based permissions
  -- If manage was explicitly denied on this user, manage cannot grant actions
  return exists (
    select 1
      from public.profiles p
      join public.roles r on r.workspace_id = p.workspace_id and r.key = p.role
      join public.role_permissions rp on rp.role_id = r.id
     where p.id = p_user
       and (
         rp.permission = (p_module || '.' || p_action)
         or (
           coalesce(v_manage_effect, 'allow') <> 'deny'
           and (p_action <> 'export' or coalesce(v_export_allowed, true))
           and rp.permission = (p_module || '.manage')
         )
       )
  );
end $$;

create or replace function public.has_permission_for(p_user uuid, p_key text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.can_do_for(p_user, split_part(p_key, '.', 1), split_part(p_key, '.', 2));
end $$;

create or replace function public.has_permission(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission_for(auth.uid(), p_key);
$$;

create or replace function public.can_do(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_do_for(auth.uid(), p_module, p_action);
$$;

-- my_permissions: returns comprehensive, expanded effective permissions array evaluated by can_do_for
create or replace function public.my_permissions() returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_result text[];
begin
  if v_user is null then return '{}'::text[]; end if;

  select role, is_active into v_role, v_active
    from public.profiles where id = v_user;

  if not coalesce(v_active, false) then return '{}'::text[]; end if;

  -- Super Admin receives ALL permissions across the catalog
  if v_role = 'super_admin' then
    select coalesce(array_agg(key order by key), '{}') into v_result
      from public.permissions;
    return v_result;
  end if;

  -- Non-super admins: evaluate each catalog permission against the bulletproof can_do_for
  select coalesce(array_agg(p.key order by p.key), '{}') into v_result
    from public.permissions p
   where public.can_do_for(v_user, p.module, p.action);

  return coalesce(v_result, '{}'::text[]);
end $$;

-- ABAC Data Scope helper
create or replace function public.check_abac_scope(
  p_assigned_to uuid,
  p_created_by uuid,
  p_module text default null
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_scope text;
  v_has_manage boolean;
begin
  if v_user is null then return false; end if;

  select role, coalesce(record_scope, 'all') into v_role, v_scope
    from public.profiles where id = v_user and is_active;

  if v_role is null then return false; end if;
  if v_role = 'super_admin' then return true; end if;

  v_has_manage := public.can_do_for(v_user, coalesce(p_module, 'leads'), 'manage');
  if v_has_manage and v_scope = 'all' then
    return true;
  end if;

  if v_scope = 'own' then
    return (p_assigned_to = v_user or p_created_by = v_user);
  end if;

  -- Team scope or non-manage 'all' scope
  return (p_assigned_to = v_user or p_created_by = v_user or public.is_team_member(p_assigned_to) or public.is_team_member(p_created_by));
end $$;

revoke all on function public.has_permission_for(uuid, text), public.can_do_for(uuid, text, text) from public, anon;
grant execute on function public.has_permission_for(uuid, text), public.can_do_for(uuid, text, text) to authenticated;
grant execute on function public.has_permission(text), public.can_do(text, text), public.my_permissions(), public.check_abac_scope(uuid, uuid, text) to authenticated;

-- ============ 5. RLS AND SECURITY GUARDS FOR USER_PERMISSIONS ============
alter table public.user_permissions enable row level security;

create policy user_permissions_select on public.user_permissions for select to authenticated
  using (
    user_id = auth.uid()
    or (select public.current_user_role()) = 'super_admin'
    or (select public.has_permission('roles.manage'))
    or (select public.has_permission('users.manage'))
  );

create policy user_permissions_insert on public.user_permissions for insert to authenticated
  with check (
    (select public.current_user_role()) = 'super_admin'
    or (select public.has_permission('roles.manage'))
  );

create policy user_permissions_update on public.user_permissions for update to authenticated
  using (
    (select public.current_user_role()) = 'super_admin'
    or (select public.has_permission('roles.manage'))
  )
  with check (
    (select public.current_user_role()) = 'super_admin'
    or (select public.has_permission('roles.manage'))
  );

create policy user_permissions_delete on public.user_permissions for delete to authenticated
  using (
    (select public.current_user_role()) = 'super_admin'
    or (select public.has_permission('roles.manage'))
  );

create or replace function public.user_permissions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_target_id uuid;
  v_target_role text;
  v_target_permanent boolean;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  v_target_id := coalesce(new.user_id, old.user_id);
  select role, is_permanent into v_target_role, v_target_permanent from public.profiles where id = v_target_id;
  if v_target_role = 'super_admin' or coalesce(v_target_permanent, false) then
    if tg_op = 'INSERT' and new.effect = 'deny' then
      raise exception 'Permissions cannot be denied for Super Admin or protected accounts.' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_user_permissions_guard on public.user_permissions;
create trigger trg_user_permissions_guard
  before insert or update on public.user_permissions
  for each row execute function public.user_permissions_guard();

-- ============ 6. ENFORCE ABAC & SCOPING ON RECORD-SCOPED DATA POLICIES ============
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('leads', 'view'))
  and public.check_abac_scope(assigned_to, created_by, 'leads')
);

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('leads', 'edit'))
  and public.check_abac_scope(assigned_to, created_by, 'leads')
) with check (workspace_id = (select public.current_workspace_id()));

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('leads', 'delete'))
  and public.check_abac_scope(assigned_to, created_by, 'leads')
);

drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('deals', 'view'))
  and public.check_abac_scope(assigned_to, created_by, 'deals')
);

drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals for update to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('deals', 'edit'))
  and public.check_abac_scope(assigned_to, created_by, 'deals')
) with check (workspace_id = (select public.current_workspace_id()));

drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('deals', 'delete'))
  and public.check_abac_scope(assigned_to, created_by, 'deals')
);

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('tasks', 'view'))
  and public.check_abac_scope(assigned_to, created_by, 'tasks')
);

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('tasks', 'edit'))
  and public.check_abac_scope(assigned_to, created_by, 'tasks')
) with check (workspace_id = (select public.current_workspace_id()));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('tasks', 'delete'))
  and public.check_abac_scope(assigned_to, created_by, 'tasks')
);

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('projects', 'view'))
  and public.check_abac_scope(assigned_to, created_by, 'projects')
);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('projects', 'edit'))
  and public.check_abac_scope(assigned_to, created_by, 'projects')
) with check (workspace_id = (select public.current_workspace_id()));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('projects', 'delete'))
  and public.check_abac_scope(assigned_to, created_by, 'projects')
);

drop policy if exists tickets_select on public.support_tickets;
create policy tickets_select on public.support_tickets for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('tickets', 'view'))
  and public.check_abac_scope(assigned_to, created_by, 'tickets')
);

drop policy if exists tickets_update on public.support_tickets;
create policy tickets_update on public.support_tickets for update to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('tickets', 'edit'))
  and public.check_abac_scope(assigned_to, created_by, 'tickets')
) with check (workspace_id = (select public.current_workspace_id()));

drop policy if exists tickets_delete on public.support_tickets;
create policy tickets_delete on public.support_tickets for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('tickets', 'delete'))
  and public.check_abac_scope(assigned_to, created_by, 'tickets')
);

-- website_enquiries & website_contact_messages: drop old wide-open policies and enforce strict RBAC/ABAC
drop policy if exists website_enquiries_select on public.website_enquiries;
create policy website_enquiries_select on public.website_enquiries for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('website_queries', 'view'))
);

drop policy if exists website_enquiries_insert on public.website_enquiries;
create policy website_enquiries_insert on public.website_enquiries for insert to authenticated with check (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('website_queries', 'create'))
);

drop policy if exists website_enquiries_update on public.website_enquiries;
create policy website_enquiries_update on public.website_enquiries for update to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('website_queries', 'edit'))
) with check (workspace_id = (select public.current_workspace_id()));

drop policy if exists website_enquiries_delete on public.website_enquiries;
create policy website_enquiries_delete on public.website_enquiries for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('website_queries', 'delete'))
);

drop policy if exists website_contacts_select on public.website_contact_messages;
create policy website_contacts_select on public.website_contact_messages for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('website_queries', 'view'))
);

drop policy if exists website_contacts_insert on public.website_contact_messages;
create policy website_contacts_insert on public.website_contact_messages for insert to authenticated with check (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('website_queries', 'create'))
);

drop policy if exists website_contacts_update on public.website_contact_messages;
create policy website_contacts_update on public.website_contact_messages for update to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('website_queries', 'edit'))
) with check (workspace_id = (select public.current_workspace_id()));

drop policy if exists website_contacts_delete on public.website_contact_messages;
create policy website_contacts_delete on public.website_contact_messages for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('website_queries', 'delete'))
);

-- services: secure select policy
drop policy if exists services_select on public.services;
create policy services_select on public.services for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (
    (select public.can_do('settings', 'view'))
    or (select public.can_do('leads', 'view'))
    or (select public.can_do('deals', 'view'))
    or (select public.can_do('invoices', 'view'))
    or (select public.can_do('projects', 'view'))
  )
);

-- invoices: secure scoping
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('invoices', 'view'))
  and public.check_abac_scope(created_by, created_by, 'invoices')
);

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.can_do('invoices', 'edit'))
  and public.check_abac_scope(created_by, created_by, 'invoices')
) with check (workspace_id = (select public.current_workspace_id()));

drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and status = 'draft'
  and (select public.can_do('invoices', 'delete'))
  and public.check_abac_scope(created_by, created_by, 'invoices')
);

-- ============ 7. PROFILES ABAC INTEGRITY GUARD ============
-- Ensure that users cannot elevate their own ABAC attributes (allowed_modules, record_scope, export_allowed)
create or replace function public.abac_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  actor_role text;
begin
  if actor is null then return new; end if; -- migration / service role
  actor_role := public.current_user_role();

  if (new.allowed_modules is distinct from old.allowed_modules
      or new.allowed_services is distinct from old.allowed_services
      or new.record_scope is distinct from old.record_scope
      or new.export_allowed is distinct from old.export_allowed) then
    if not (actor_role = 'super_admin' or public.has_permission('users.manage') or public.has_permission('roles.manage')) then
      raise exception 'Only administrators can modify access control attributes.' using errcode = 'P0001';
    end if;
    if actor = new.id and actor_role <> 'super_admin' then
      raise exception 'You cannot modify your own access control attributes.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_abac_profiles_guard on public.profiles;
create trigger trg_abac_profiles_guard
  before update on public.profiles
  for each row execute function public.abac_profiles_guard();

