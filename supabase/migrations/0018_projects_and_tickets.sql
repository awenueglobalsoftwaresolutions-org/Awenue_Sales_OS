-- Projects (with workflow stages, updates, reminders) and client support tickets.
-- Every project and ticket belongs to an organization. Tickets belong to a project. History tables are append-only.

-- ============ 1. permissions and default grants
insert into public.permissions (key, module, action)
select m.module || '.' || a, m.module, a from (values
  ('projects', array['view', 'create', 'edit', 'delete', 'manage']),
  ('tickets', array['view', 'create', 'edit', 'delete', 'manage', 'assign', 'approve'])) as m(module, actions), unnest(m.actions) as a
on conflict do nothing;

create table public.project_stage_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position int not null check (position > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

-- Grants for a workspace's roles, plus its default stage templates. Also used when a new workspace is created.
create or replace function public.seed_project_defaults(p_ws uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into role_permissions (role_id, permission)
  select r.id, p.key from roles r join permissions p on p.module in ('projects', 'tickets')
   where r.workspace_id = p_ws and r.key in ('super_admin', 'admin') on conflict do nothing;
  insert into role_permissions (role_id, permission)
  select r.id, p.key from roles r join permissions p on p.key in ('projects.view', 'projects.create', 'projects.edit', 'projects.delete', 'projects.manage',
      'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.delete', 'tickets.manage', 'tickets.assign', 'tickets.approve')
   where r.workspace_id = p_ws and r.key = 'sales_manager' on conflict do nothing;
  insert into role_permissions (role_id, permission)
  select r.id, p.key from roles r join permissions p on p.key in ('projects.view', 'projects.create', 'projects.edit', 'tickets.view', 'tickets.create', 'tickets.edit')
   where r.workspace_id = p_ws and r.key = 'sales_executive' on conflict do nothing;
  insert into project_stage_templates (workspace_id, name, position) values
    (p_ws, 'Requirement Gathering', 1), (p_ws, 'Planning & Documentation', 2), (p_ws, 'UI/UX Design', 3), (p_ws, 'Development', 4),
    (p_ws, 'Testing & Quality Assurance', 5), (p_ws, 'Client Review', 6), (p_ws, 'Deployment', 7)
  on conflict (workspace_id, name) do nothing;
end $$;
revoke all on function public.seed_project_defaults(uuid) from public, anon, authenticated;
select public.seed_project_defaults(id) from public.workspaces;

-- ============ 2. projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_number bigint generated always as identity,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text check (char_length(description) <= 5000),
  start_date date,
  expected_end_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'on_hold', 'pending_client_approval', 'under_review', 'completed', 'cancelled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text check (char_length(notes) <= 5000),
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_end_date is null or start_date is null or expected_end_date >= start_date)
);
create index projects_ws_status_idx on public.projects (workspace_id, status);
create index projects_org_idx on public.projects (organization_id);
create index projects_assigned_idx on public.projects (assigned_to);

create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  position int not null check (position > 0),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  work_summary text check (char_length(work_summary) <= 5000),
  started_at timestamptz,
  completed_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, position)
);

create table public.project_updates (                       -- append-only progress log and remarks
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete set null,
  kind text not null check (kind in ('update', 'remark', 'status_change', 'stage_change')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index project_updates_project_idx on public.project_updates (project_id, created_at desc);

create table public.project_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (char_length(description) <= 2000),
  due_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  is_done boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_reminders_project_idx on public.project_reminders (project_id, is_done, due_date);

-- ============ 3. support tickets
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ticket_number bigint generated always as identity,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  category text not null default 'general_query' check (category in ('bug_report', 'technical_issue', 'feature_request', 'enhancement_request', 'ui_ux_issue', 'general_query', 'other')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'waiting_client', 'under_review', 'resolved', 'closed')),
  resolution text check (char_length(resolution) <= 5000),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('resolved', 'closed') or char_length(btrim(coalesce(resolution, ''))) > 0)
);
create index support_tickets_project_idx on public.support_tickets (project_id, status);
create index support_tickets_org_idx on public.support_tickets (organization_id);
create index support_tickets_ws_status_idx on public.support_tickets (workspace_id, status);

create table public.ticket_events (                         -- append-only history of a ticket
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'status_changed', 'assigned', 'resolved', 'closed')),
  description text not null default '',
  from_status text,
  to_status text,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at);

-- ============ 4. updated_at and history protection
do $$ declare t text; begin
  foreach t in array array['projects', 'project_stages', 'project_reminders', 'support_tickets', 'project_stage_templates'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create or replace function public.history_is_permanent() returns trigger language plpgsql as $$
begin raise exception 'History records can''t be changed or deleted.' using errcode = 'P0001'; end $$;
create trigger project_updates_immutable before update or delete on public.project_updates for each row execute function public.history_is_permanent();
create trigger ticket_events_immutable before update or delete on public.ticket_events for each row execute function public.history_is_permanent();

-- ============ 5. consistency and workflow rules
-- A project and its tickets must belong to an organization in the same workspace, and assignees must be in the same workspace.
create or replace function public.projects_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from organizations where id = new.organization_id and workspace_id = new.workspace_id) then
    raise exception 'That organization isn''t in this workspace.' using errcode = 'P0001';
  end if;
  if new.assigned_to is not null and not exists (select 1 from profiles where id = new.assigned_to and workspace_id = new.workspace_id) then
    raise exception 'That person isn''t in this workspace.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id and exists (select 1 from support_tickets where project_id = old.id) then
    raise exception 'A project with support tickets can''t be moved to another organization.' using errcode = 'P0001';
  end if;
  if new.status is distinct from coalesce(old.status, '') then
    if new.status = 'completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
    if new.status = 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now()); end if;
    if new.status not in ('completed') then new.completed_at := null; end if;
    if new.status not in ('cancelled') then new.cancelled_at := null; end if;
  end if;
  return new;
end $$;
create trigger projects_guard before insert or update on public.projects for each row execute function public.projects_guard();

-- Every status change is written to the project's update log.
create or replace function public.projects_log_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into project_updates (workspace_id, project_id, kind, body, created_by)
    values (new.workspace_id, new.id, 'status_change', 'Status changed from ' || replace(old.status, '_', ' ') || ' to ' || replace(new.status, '_', ' '), auth.uid());
  end if;
  return null;
end $$;
create trigger projects_log_status after update of status on public.projects for each row execute function public.projects_log_status();

-- Stage timestamps, and the project's progress is always the share of stages that are done.
create or replace function public.project_stages_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and new.status = 'in_progress' then new.started_at := coalesce(new.started_at, now()); end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'in_progress' then new.started_at := coalesce(new.started_at, now()); end if;
    new.completed_at := case when new.status = 'done' then now() else null end;
    insert into project_updates (workspace_id, project_id, stage_id, kind, body, created_by)
    values (new.workspace_id, new.project_id, new.id, 'stage_change', 'Stage "' || new.name || '" is now ' || replace(new.status, '_', ' '), auth.uid());
  end if;
  return new;
end $$;
create trigger project_stages_guard before insert or update on public.project_stages for each row execute function public.project_stages_guard();

create or replace function public.project_stages_progress() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.project_id, old.project_id);
begin
  update projects p set progress = (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status = 'done') / count(*)) end
                                      from project_stages s where s.project_id = pid)
   where p.id = pid;
  return null;
end $$;
create trigger project_stages_progress after insert or update of status or delete on public.project_stages for each row execute function public.project_stages_progress();

create or replace function public.tickets_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare proj record; actor uuid := auth.uid();
begin
  select organization_id, workspace_id into proj from projects where id = new.project_id;
  if proj is null or proj.workspace_id <> new.workspace_id or proj.organization_id <> new.organization_id then
    raise exception 'A ticket must belong to a project of the same organization.' using errcode = 'P0001';
  end if;
  if new.assigned_to is not null and not exists (select 1 from profiles where id = new.assigned_to and workspace_id = new.workspace_id) then
    raise exception 'That person isn''t in this workspace.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'open' and new.status <> 'assigned' then new.status := 'open'; end if;
    return new;
  end if;
  if new.assigned_to is distinct from old.assigned_to and actor is not null and not public.can_do('tickets', 'assign') then
    raise exception 'You don''t have permission to assign tickets.' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'closed' and actor is not null and not public.can_do('tickets', 'approve') then
      raise exception 'You don''t have permission to close tickets.' using errcode = 'P0001';
    end if;
    if new.status = 'resolved' then new.resolved_at := now(); new.resolved_by := actor; end if;
    if new.status = 'closed' then new.closed_at := now(); new.closed_by := actor; end if;
  end if;
  return new;
end $$;
create trigger tickets_guard before insert or update on public.support_tickets for each row execute function public.tickets_guard();

-- Ticket history: creation, status changes, assignment, resolution and closure.
create or replace function public.tickets_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into ticket_events (ticket_id, workspace_id, event_type, description, to_status, user_id)
    values (new.id, new.workspace_id, 'created', 'Ticket raised: ' || new.subject, new.status, new.created_by);
  elsif new.status is distinct from old.status then
    insert into ticket_events (ticket_id, workspace_id, event_type, description, from_status, to_status, user_id)
    values (new.id, new.workspace_id,
            case new.status when 'resolved' then 'resolved' when 'closed' then 'closed' else 'status_changed' end,
            'Status changed from ' || replace(old.status, '_', ' ') || ' to ' || replace(new.status, '_', ' '),
            old.status, new.status, auth.uid());
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to then
    insert into ticket_events (ticket_id, workspace_id, event_type, description, user_id)
    values (new.id, new.workspace_id, 'assigned', 'Assignee changed', auth.uid());
  end if;
  return null;
end $$;
create trigger tickets_log after insert or update on public.support_tickets for each row execute function public.tickets_log();

-- ============ 6. create a project with its stages in one step
create or replace function public.create_project(p jsonb) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_ws uuid := public.current_workspace_id(); v_id uuid;
begin
  insert into projects (workspace_id, organization_id, name, description, start_date, expected_end_date, priority, assigned_to, notes, created_by)
  values (v_ws, nullif(p->>'organization_id', '')::uuid, btrim(p->>'name'), nullif(btrim(p->>'description'), ''),
          nullif(p->>'start_date', '')::date, nullif(p->>'expected_end_date', '')::date, coalesce(nullif(p->>'priority', ''), 'medium'),
          nullif(p->>'assigned_to', '')::uuid, nullif(btrim(p->>'notes'), ''), auth.uid())
  returning id into v_id;
  insert into project_stages (workspace_id, project_id, position, name)
  select v_ws, v_id, row_number() over (order by t.position), t.name from project_stage_templates t
   where t.workspace_id = v_ws and t.is_active order by t.position;
  return v_id;
end $$;
grant execute on function public.create_project(jsonb) to authenticated;

create or replace function public.project_summary() returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'projects', (select coalesce(jsonb_object_agg(status, c), '{}') from (select status, count(*) c from projects group by status) x),
    'tickets', (select coalesce(jsonb_object_agg(status, c), '{}') from (select status, count(*) c from support_tickets group by status) y),
    'overdue_reminders', (select count(*)::int from project_reminders where not is_done and due_date < current_date))
$$;
grant execute on function public.project_summary() to authenticated;

-- ============ 7. access (module-wide for projects and tickets; history follows the record)
alter table public.projects enable row level security;
alter table public.project_stage_templates enable row level security;
alter table public.project_stages enable row level security;
alter table public.project_updates enable row level security;
alter table public.project_reminders enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_events enable row level security;

create policy projects_select on public.projects for select to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('projects', 'view')));
create policy projects_insert on public.projects for insert to authenticated with check (workspace_id = (select public.current_workspace_id()) and created_by = (select auth.uid()) and (select public.can_do('projects', 'create')));
create policy projects_update on public.projects for update to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('projects', 'edit'))) with check (workspace_id = (select public.current_workspace_id()));
create policy projects_delete on public.projects for delete to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('projects', 'delete')));

create policy stage_templates_select on public.project_stage_templates for select to authenticated using (workspace_id = (select public.current_workspace_id()));
create policy stage_templates_write on public.project_stage_templates for all to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('projects', 'manage')))
  with check (workspace_id = (select public.current_workspace_id()) and (select public.can_do('projects', 'manage')));

create policy project_stages_select on public.project_stages for select to authenticated using (exists (select 1 from projects p where p.id = project_id));
create policy project_stages_write on public.project_stages for all to authenticated
  using ((select public.can_do('projects', 'edit')) and exists (select 1 from projects p where p.id = project_id))
  with check ((select public.can_do('projects', 'edit')) and exists (select 1 from projects p where p.id = project_id));

create policy project_updates_select on public.project_updates for select to authenticated using (exists (select 1 from projects p where p.id = project_id));
create policy project_updates_insert on public.project_updates for insert to authenticated
  with check (created_by = (select auth.uid()) and kind in ('update', 'remark') and (select public.can_do('projects', 'edit')) and exists (select 1 from projects p where p.id = project_id));

create policy project_reminders_select on public.project_reminders for select to authenticated using (exists (select 1 from projects p where p.id = project_id));
create policy project_reminders_insert on public.project_reminders for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.can_do('projects', 'edit')) and exists (select 1 from projects p where p.id = project_id));
create policy project_reminders_update on public.project_reminders for update to authenticated
  using ((select public.can_do('projects', 'edit')) and exists (select 1 from projects p where p.id = project_id))
  with check (exists (select 1 from projects p where p.id = project_id));
create policy project_reminders_delete on public.project_reminders for delete to authenticated using ((select public.can_do('projects', 'manage')));

create policy tickets_select on public.support_tickets for select to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('tickets', 'view')));
create policy tickets_insert on public.support_tickets for insert to authenticated with check (workspace_id = (select public.current_workspace_id()) and created_by = (select auth.uid()) and (select public.can_do('tickets', 'create')));
create policy tickets_update on public.support_tickets for update to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('tickets', 'edit'))) with check (workspace_id = (select public.current_workspace_id()));
create policy tickets_delete on public.support_tickets for delete to authenticated using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('tickets', 'manage')));

create policy ticket_events_select on public.ticket_events for select to authenticated using (exists (select 1 from support_tickets t where t.id = ticket_id));

-- ============ 8. audit trail (same trail as the rest of the CRM)
create trigger audit_row_change after insert or update or delete on public.projects for each row execute function public.audit_row_change('projects');
create trigger audit_row_change after insert or update or delete on public.project_stages for each row execute function public.audit_row_change('projects');
create trigger audit_row_change after insert or update or delete on public.project_reminders for each row execute function public.audit_row_change('projects');
create trigger audit_row_change after insert or update or delete on public.support_tickets for each row execute function public.audit_row_change('tickets');

-- New workspaces get the project defaults too (first-user bootstrap from 0016, plus this line).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid; new_role text; active boolean;
begin
  select id into ws from public.workspaces order by created_at limit 1;
  if ws is null then
    insert into public.workspaces (name) values ('Awenue Global Software Solutions') returning id into ws;
  end if;
  perform public.seed_default_roles(ws);
  perform public.seed_project_defaults(ws);
  insert into public.services (workspace_id, name, sort_order)
  select ws, s.name, s.ord from (values
    ('Web Development', 1), ('SaaS Development', 2), ('Mobile App Development', 3), ('AI & Automation', 4),
    ('Digital Marketing', 5), ('Graphic Design & Branding', 6), ('IT Consultancy', 7), ('Other', 8)) as s(name, ord)
  on conflict (workspace_id, name) do nothing;
  if not exists (select 1 from public.profiles where workspace_id = ws) then
    new_role := 'super_admin'; active := true;
  else
    new_role := 'sales_executive'; active := false;
  end if;
  insert into public.profiles (id, workspace_id, email, full_name, role, is_active)
  values (new.id, ws, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new_role, active);
  return new;
end $$;
