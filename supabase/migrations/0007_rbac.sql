-- Enhancement phase 1: centralized RBAC, richer profiles, secure user provisioning.
-- Additive and backward compatible: existing roles keep their current behaviour (see seed_default_roles).

-- ============ 1. permission catalogue ============
create table public.permissions (
  key text primary key,                                -- 'leads.view'
  module text not null,
  action text not null check (action in ('view','create','edit','delete','manage','export','assign','approve')),
  description text not null default ''
);
insert into public.permissions (key, module, action)
select m.module || '.' || a, m.module, a
from (values
  ('dashboard',      array['view']),
  ('leads',          array['view','create','edit','delete','manage','export','assign']),
  ('organizations',  array['view','create','edit','delete','manage','export']),
  ('contacts',       array['view','create','edit','delete','manage','export']),
  ('deals',          array['view','create','edit','delete','manage','export','assign']),
  ('tasks',          array['view','create','edit','delete','manage','assign']),
  ('files',          array['view','create','edit','delete','manage']),
  ('activities',     array['view','create','delete','manage']),
  ('reports',        array['view','export','manage']),
  ('invoices',       array['view','create','edit','delete','manage','export','approve']),
  ('communications', array['view','create','manage']),
  ('users',          array['view','create','edit','delete','assign','manage']),
  ('roles',          array['view','manage']),
  ('settings',       array['view','manage']),
  ('integrations',   array['view','manage'])
) as m(module, actions), unnest(m.actions) as a;

-- ============ 2. roles ============
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission)
);
create trigger set_updated_at before update on public.roles for each row execute function public.set_updated_at();

-- Default roles. 'manage' on a module means "every record in the module"; without it, view/edit/delete apply to
-- records the person owns, created, or that belong to their team (profiles.manager_id).
create or replace function public.seed_default_roles(p_ws uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r_super uuid; r_admin uuid; r_mgr uuid; r_rep uuid;
begin
  insert into roles (workspace_id, key, name, description, is_system) values
    (p_ws, 'super_admin',     'Super Admin',          'Full system access, users, roles and integrations', true),
    (p_ws, 'admin',           'Admin',                'Administrative access without role and integration control', true),
    (p_ws, 'sales_manager',   'Sales Manager',        'Manages sales records and teams', true),
    (p_ws, 'sales_executive', 'Sales Representative', 'Works on their own leads, deals and tasks', true)
  on conflict (workspace_id, key) do nothing;
  select id into r_super from roles where workspace_id = p_ws and key = 'super_admin';
  select id into r_admin from roles where workspace_id = p_ws and key = 'admin';
  select id into r_mgr   from roles where workspace_id = p_ws and key = 'sales_manager';
  select id into r_rep   from roles where workspace_id = p_ws and key = 'sales_executive';

  insert into role_permissions select r_super, key from permissions on conflict do nothing;

  insert into role_permissions select r_admin, key from permissions
   where key not in ('roles.manage', 'integrations.manage', 'users.manage', 'users.delete') on conflict do nothing;

  insert into role_permissions select r_mgr, key from permissions where key in (
    'dashboard.view',
    'leads.view','leads.create','leads.edit','leads.delete','leads.manage','leads.export','leads.assign',
    'deals.view','deals.create','deals.edit','deals.delete','deals.manage','deals.export','deals.assign',
    'tasks.view','tasks.create','tasks.edit','tasks.delete','tasks.manage','tasks.assign',
    'organizations.view','organizations.create','organizations.edit','organizations.delete','organizations.export',
    'contacts.view','contacts.create','contacts.edit','contacts.delete','contacts.export',
    'files.view','files.create','files.edit','files.delete','files.manage',
    'activities.view','activities.create','activities.delete','activities.manage',
    'reports.view','invoices.view','invoices.create','invoices.edit','invoices.export',
    'communications.view','communications.create',
    'users.view','roles.view','settings.view') on conflict do nothing;

  insert into role_permissions select r_rep, key from permissions where key in (
    'dashboard.view',
    'leads.view','leads.create','leads.edit','leads.delete','leads.export',
    'deals.view','deals.create','deals.edit','deals.delete','deals.export',
    'tasks.view','tasks.create','tasks.edit','tasks.delete',
    'organizations.view','organizations.create','organizations.edit','organizations.export',
    'contacts.view','contacts.create','contacts.edit','contacts.export',
    'files.view','files.create','files.edit','files.delete',
    'activities.view','activities.create','activities.delete',
    'invoices.view','invoices.create','invoices.edit',
    'communications.view','communications.create') on conflict do nothing;
end $$;
revoke all on function public.seed_default_roles(uuid) from public, anon, authenticated;

select public.seed_default_roles(id) from public.workspaces;

-- ============ 3. profiles ============
alter table public.profiles
  add column job_title text, add column department text, add column bio text,
  add column timezone text not null default 'UTC',
  add column preferences jsonb not null default '{}'::jsonb,
  add column must_change_password boolean not null default false;

drop trigger if exists profiles_protect_last_admin on public.profiles;   -- replaced below
alter table public.profiles drop constraint if exists profiles_role_check;
-- the earliest admin of each workspace becomes Super Admin (nobody loses access)
update public.profiles p set role = 'super_admin'
 where p.role = 'admin'
   and p.id = (select id from public.profiles x where x.workspace_id = p.workspace_id and x.role = 'admin' order by x.created_at limit 1)
   and not exists (select 1 from public.profiles y where y.workspace_id = p.workspace_id and y.role = 'super_admin');
alter table public.profiles add constraint profiles_role_fk
  foreign key (workspace_id, role) references public.roles (workspace_id, key) on update cascade;

-- ============ 4. permission helpers ============
create or replace function public.has_permission(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join roles r on r.workspace_id = p.workspace_id and r.key = p.role
      join role_permissions rp on rp.role_id = r.id
     where p.id = auth.uid() and p.is_active and rp.permission = p_key)
$$;
-- "can do <action> on <module>": the exact permission, or 'manage' for the whole module
create or replace function public.can_do(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select bool_or(rp.permission in (p_module || '.' || p_action, p_module || '.manage'))
      from profiles p join roles r on r.workspace_id = p.workspace_id and r.key = p.role
        join role_permissions rp on rp.role_id = r.id
     where p.id = auth.uid() and p.is_active), false)
$$;
create or replace function public.my_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(rp.permission order by rp.permission), '{}')
    from profiles p join roles r on r.workspace_id = p.workspace_id and r.key = p.role
      join role_permissions rp on rp.role_id = r.id
   where p.id = auth.uid() and p.is_active
$$;
create or replace function public.is_team_member(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from profiles where id = p_user and manager_id = auth.uid() and is_active)
$$;
revoke all on function public.has_permission(text), public.can_do(text, text), public.my_permissions(), public.is_team_member(uuid) from public, anon;
grant execute on function public.has_permission(text), public.can_do(text, text), public.my_permissions(), public.is_team_member(uuid) to authenticated;

-- ============ 5. replace the data policies ============
do $$ declare pol record; begin
  for pol in select policyname, tablename from pg_policies where schemaname = 'public'
     and tablename in ('workspaces','profiles','services','organizations','contacts','activities','leads','deals','tasks','org_items')
     and policyname not in ('workspaces_select','profiles_select','services_select')
  loop execute format('drop policy %I on public.%I', pol.policyname, pol.tablename); end loop;
end $$;

create policy workspaces_update on public.workspaces for update to authenticated
  using (id = (select public.current_workspace_id()) and (select public.can_do('settings','manage')))
  with check (id = (select public.current_workspace_id()));

-- profiles: everyone edits themselves (sensitive columns are guarded by a trigger); users.edit edits others
create policy profiles_update on public.profiles for update to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (id = (select auth.uid()) or (select public.can_do('users','edit'))))
  with check (workspace_id = (select public.current_workspace_id()));

create policy services_write on public.services for all to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('settings','manage')))
  with check (workspace_id = (select public.current_workspace_id()));

-- module-wide data: organizations, contacts
create policy organizations_select on public.organizations for select to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('organizations','view')));
create policy organizations_insert on public.organizations for insert to authenticated with check (workspace_id = (select public.current_workspace_id()) and (select public.can_do('organizations','create')));
create policy organizations_update on public.organizations for update to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('organizations','edit'))) with check (workspace_id = (select public.current_workspace_id()));
create policy organizations_delete on public.organizations for delete to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('organizations','delete')));

create policy contacts_select on public.contacts for select to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('contacts','view')));
create policy contacts_insert on public.contacts for insert to authenticated with check (workspace_id = (select public.current_workspace_id()) and (select public.can_do('contacts','create')));
create policy contacts_update on public.contacts for update to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('contacts','edit'))) with check (workspace_id = (select public.current_workspace_id()));
create policy contacts_delete on public.contacts for delete to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('contacts','delete')));

-- activities
create policy activities_select on public.activities for select to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('activities','view')));
create policy activities_insert on public.activities for insert to authenticated with check (workspace_id = (select public.current_workspace_id()) and user_id = (select auth.uid()) and (select public.can_do('activities','create')));
create policy activities_delete on public.activities for delete to authenticated
  using (workspace_id = (select public.current_workspace_id()) and ((select public.has_permission('activities.manage')) or ((select public.has_permission('activities.delete')) and user_id = (select auth.uid()))));

-- files
create policy org_items_select on public.org_items for select to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('files','view')));
create policy org_items_insert on public.org_items for insert to authenticated with check (workspace_id = (select public.current_workspace_id()) and created_by = (select auth.uid()) and (select public.can_do('files','create')));
create policy org_items_update on public.org_items for update to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('files','edit'))) with check (workspace_id = (select public.current_workspace_id()));
create policy org_items_delete on public.org_items for delete to authenticated
  using (workspace_id = (select public.current_workspace_id()) and ((select public.has_permission('files.manage')) or ((select public.has_permission('files.delete')) and created_by = (select auth.uid()))));

-- record-scoped data: leads, deals, tasks.
--   manage            -> every record in the workspace
--   view/edit/delete  -> records you are assigned to, created, or that belong to someone on your team
do $$
declare m text;
begin
  foreach m in array array['leads','deals','tasks'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s for select to authenticated using (
        workspace_id = (select public.current_workspace_id()) and (
          (select public.has_permission(%1$L || '.manage'))
          or ((select public.has_permission(%1$L || '.view')) and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()) or public.is_team_member(assigned_to)))));
      create policy %1$s_insert on public.%1$s for insert to authenticated with check (
        workspace_id = (select public.current_workspace_id()) and created_by = (select auth.uid()) and (select public.can_do(%1$L, 'create')));
      create policy %1$s_update on public.%1$s for update to authenticated using (
        workspace_id = (select public.current_workspace_id()) and (
          (select public.has_permission(%1$L || '.manage'))
          or ((select public.has_permission(%1$L || '.edit')) and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()) or public.is_team_member(assigned_to)))))
        with check (workspace_id = (select public.current_workspace_id()));
      create policy %1$s_delete on public.%1$s for delete to authenticated using (
        workspace_id = (select public.current_workspace_id()) and (
          (select public.has_permission(%1$L || '.manage'))
          or ((select public.has_permission(%1$L || '.delete')) and created_by = (select auth.uid()))));
    $f$, m);
  end loop;
end $$;

-- ============ 6. role tables ============
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy roles_select on public.roles for select to authenticated using (workspace_id = (select public.current_workspace_id()));
create policy roles_write on public.roles for all to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (select public.has_permission('roles.manage')))
  with check (workspace_id = (select public.current_workspace_id()) and (select public.has_permission('roles.manage')));
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and r.workspace_id = (select public.current_workspace_id())));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and r.workspace_id = (select public.current_workspace_id())) and (select public.has_permission('roles.manage')))
  with check (exists (select 1 from public.roles r where r.id = role_id and r.workspace_id = (select public.current_workspace_id())) and (select public.has_permission('roles.manage')));

create or replace function public.roles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;            -- migrations / service role
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'Built-in roles can''t be deleted.' using errcode = 'P0001'; end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if new.key <> old.key or new.is_system <> old.is_system then raise exception 'A role''s key can''t be changed.' using errcode = 'P0001'; end if;
  elsif new.is_system then
    raise exception 'Custom roles can''t be marked built-in.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger roles_guard before insert or update or delete on public.roles for each row execute function public.roles_guard();

create or replace function public.role_permissions_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if exists (select 1 from roles where id = coalesce(new.role_id, old.role_id) and key = 'super_admin') then
    raise exception 'The Super Admin role always has every permission.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger role_permissions_guard before insert or update or delete on public.role_permissions for each row execute function public.role_permissions_guard();

-- ============ 7. profile guards ============
create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); actor_role text;
begin
  if actor is null then return new; end if;                                -- service role / migrations
  actor_role := public.current_user_role();
  if new.workspace_id is distinct from old.workspace_id or new.email is distinct from old.email then
    raise exception 'That field can''t be changed.' using errcode = 'P0001';
  end if;
  if actor <> new.id and old.role = 'super_admin' and actor_role <> 'super_admin' then
    raise exception 'Only a Super Admin can change a Super Admin account.' using errcode = 'P0001';
  end if;
  if new.role is distinct from old.role then
    if not public.has_permission('users.assign') and not public.has_permission('users.manage') then raise exception 'You don''t have permission to change roles.' using errcode = 'P0001'; end if;
    if actor = new.id then raise exception 'You can''t change your own role.' using errcode = 'P0001'; end if;
    if (new.role = 'super_admin' or old.role = 'super_admin') and actor_role <> 'super_admin' then raise exception 'Only a Super Admin can grant or remove Super Admin.' using errcode = 'P0001'; end if;
  end if;
  if new.manager_id is distinct from old.manager_id and not public.can_do('users', 'assign') then raise exception 'You don''t have permission to assign teams.' using errcode = 'P0001'; end if;
  if new.is_active is distinct from old.is_active then
    if not public.can_do('users', 'edit') then raise exception 'You don''t have permission to activate or deactivate users.' using errcode = 'P0001'; end if;
    if actor = new.id then raise exception 'You can''t deactivate your own account.' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- the workspace must always keep one active Super Admin (blocks demotion, deactivation and deletion)
create or replace function public.protect_last_super_admin() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'super_admin' and old.is_active and (tg_op = 'DELETE' or new.role <> 'super_admin' or not new.is_active) then
    if not exists (select 1 from profiles where workspace_id = old.workspace_id and role = 'super_admin' and is_active and id <> old.id) then
      raise exception 'The workspace needs at least one active Super Admin.' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger profiles_protect_last_super_admin before update of role, is_active or delete on public.profiles
  for each row execute function public.protect_last_super_admin();

-- ============ 8. assignment guard (the "assign" action) ============
create or replace function public.guard_assignment() returns trigger language plpgsql security definer set search_path = public as $$
declare m text := tg_argv[0]; actor uuid := auth.uid();
begin
  if actor is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.assigned_to is not null and new.assigned_to <> actor and not public.can_do(m, 'assign') then
      raise exception 'You don''t have permission to assign %.', m using errcode = 'P0001';
    end if;
  elsif new.assigned_to is distinct from old.assigned_to and not public.can_do(m, 'assign') then
    raise exception 'You don''t have permission to reassign %.', m using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_assignment before insert or update of assigned_to on public.leads for each row execute function public.guard_assignment('leads');
create trigger guard_assignment before insert or update of assigned_to on public.deals for each row execute function public.guard_assignment('deals');
create trigger guard_assignment before insert or update of assigned_to on public.tasks for each row execute function public.guard_assignment('tasks');

-- ============ 9. sign-up safety ============
-- The first user creates the workspace and becomes Super Admin. Anyone else who signs up starts INACTIVE
-- (no access to any data) until a user manager activates them. Roles are never taken from client-supplied metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid; new_role text; active boolean;
begin
  select id into ws from public.workspaces order by created_at limit 1;
  if ws is null then
    insert into public.workspaces (name) values ('Awenue Global Software Solutions') returning id into ws;
    insert into public.services (workspace_id, name, sort_order)
    select ws, s.name, s.ord from (values
      ('Web Development',1),('SaaS Development',2),('Mobile App Development',3),('AI & Automation',4),
      ('Digital Marketing',5),('Graphic Design & Branding',6),('IT Consultancy',7),('Other',8)) as s(name, ord);
    perform public.seed_default_roles(ws);
    new_role := 'super_admin'; active := true;
  else
    new_role := 'sales_executive'; active := false;
  end if;
  insert into public.profiles (id, workspace_id, email, full_name, role, is_active)
  values (new.id, ws, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new_role, active);
  return new;
end $$;

-- ============ 10. avatars (public read, each user writes only their own folder) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
create policy avatars_insert on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ 11. new lead sources ============
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check check (source in
  ('linkedin','cold_email','website','google_maps','referral','advertisement','other','manual','meta_ads','google_ads'));
