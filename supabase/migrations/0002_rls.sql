-- AWENUE SALES OS v1.0 — Row Level Security
-- Rules: everything is scoped to the caller's workspace.
--   Admin / Sales Manager : all records in the workspace.
--   Sales Executive       : leads, deals, tasks they own or created; shared reference data (orgs, contacts, services, activities) is workspace-wide.

create or replace function public.current_workspace_id() returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.current_user_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_manager_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('admin','sales_manager'), false)
$$;

revoke all on function public.current_workspace_id(), public.current_user_role(), public.is_manager_or_admin() from public, anon;
grant execute on function public.current_workspace_id(), public.current_user_role(), public.is_manager_or_admin() to authenticated;

alter table public.workspaces    enable row level security;
alter table public.profiles      enable row level security;
alter table public.services      enable row level security;
alter table public.organizations enable row level security;
alter table public.contacts      enable row level security;
alter table public.leads         enable row level security;
alter table public.deals         enable row level security;
alter table public.tasks         enable row level security;
alter table public.activities    enable row level security;

-- workspaces: members read; admins update
create policy workspaces_select on public.workspaces for select to authenticated using (id = public.current_workspace_id());
create policy workspaces_update on public.workspaces for update to authenticated
  using (id = public.current_workspace_id() and public.current_user_role() = 'admin')
  with check (id = public.current_workspace_id());

-- profiles: workspace members read each other; users edit themselves (not role/workspace); admins manage all
create policy profiles_select on public.profiles for select to authenticated using (workspace_id = public.current_workspace_id());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and workspace_id = public.current_workspace_id() and role = public.current_user_role());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() = 'admin')
  with check (workspace_id = public.current_workspace_id());
-- no insert policy: rows are created only by the handle_new_user trigger. no delete policy: deactivate instead.

-- services: members read; admins write
create policy services_select on public.services for select to authenticated using (workspace_id = public.current_workspace_id());
create policy services_admin_write on public.services for all to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() = 'admin')
  with check (workspace_id = public.current_workspace_id());

-- organizations, contacts, activities: workspace-wide read/write; delete limited to managers/admins (activities: own or manager)
create policy organizations_select on public.organizations for select to authenticated using (workspace_id = public.current_workspace_id());
create policy organizations_insert on public.organizations for insert to authenticated with check (workspace_id = public.current_workspace_id());
create policy organizations_update on public.organizations for update to authenticated using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
create policy organizations_delete on public.organizations for delete to authenticated using (workspace_id = public.current_workspace_id() and public.is_manager_or_admin());

create policy contacts_select on public.contacts for select to authenticated using (workspace_id = public.current_workspace_id());
create policy contacts_insert on public.contacts for insert to authenticated with check (workspace_id = public.current_workspace_id());
create policy contacts_update on public.contacts for update to authenticated using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
create policy contacts_delete on public.contacts for delete to authenticated using (workspace_id = public.current_workspace_id() and public.is_manager_or_admin());

create policy activities_select on public.activities for select to authenticated using (workspace_id = public.current_workspace_id());
create policy activities_insert on public.activities for insert to authenticated with check (workspace_id = public.current_workspace_id() and user_id = auth.uid());
create policy activities_delete on public.activities for delete to authenticated
  using (workspace_id = public.current_workspace_id() and (user_id = auth.uid() or public.is_manager_or_admin()));

-- leads / deals / tasks: managers+admins see all; executives see what they own or created
create policy leads_select on public.leads for select to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid()));
create policy leads_insert on public.leads for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and created_by = auth.uid());
create policy leads_update on public.leads for update to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid()))
  with check (workspace_id = public.current_workspace_id());
create policy leads_delete on public.leads for delete to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or created_by = auth.uid()));

create policy deals_select on public.deals for select to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid()));
create policy deals_insert on public.deals for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and created_by = auth.uid());
create policy deals_update on public.deals for update to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid()))
  with check (workspace_id = public.current_workspace_id());
create policy deals_delete on public.deals for delete to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or created_by = auth.uid()));

create policy tasks_select on public.tasks for select to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid()))
  with check (workspace_id = public.current_workspace_id());
create policy tasks_delete on public.tasks for delete to authenticated
  using (workspace_id = public.current_workspace_id() and (public.is_manager_or_admin() or created_by = auth.uid()));
