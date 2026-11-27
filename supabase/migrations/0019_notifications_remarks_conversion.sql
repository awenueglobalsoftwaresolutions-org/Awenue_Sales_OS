-- Notifications (in-app, live), ticket remarks, and converting a deal into a project.

-- ============ 1. notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('ticket_assigned', 'ticket_remark', 'ticket_status', 'ticket_resolved', 'ticket_closed',
                                     'project_assigned', 'reminder_assigned', 'task_assigned', 'deal_assigned', 'general')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text check (char_length(body) <= 1000),
  link text check (char_length(link) <= 300),
  actor_id uuid references public.profiles(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- People can switch off a type of notification for themselves. Absent means on.
create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  enabled boolean not null default true,
  primary key (user_id, type)
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
-- No insert policy: notifications are created only by the database itself.
create policy prefs_all on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A person can only mark their notification read (or unread); the content is fixed.
create or replace function public.notifications_guard() returns trigger language plpgsql as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id or new.type is distinct from old.type
     or new.title is distinct from old.title or new.body is distinct from old.body or new.link is distinct from old.link
     or new.actor_id is distinct from old.actor_id or new.created_at is distinct from old.created_at then
    raise exception 'Notifications can only be marked read or unread.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications for each row execute function public.notifications_guard();

-- Creates a notification unless it's for the person who did the action, or they've switched that type off.
create or replace function public.notify_user(p_ws uuid, p_user uuid, p_type text, p_title text, p_body text, p_link text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from notification_preferences where user_id = p_user and type = p_type and not enabled) then return; end if;
  if not exists (select 1 from profiles where id = p_user and is_active) then return; end if;
  insert into notifications (workspace_id, user_id, type, title, body, link, actor_id)
  values (p_ws, p_user, p_type, left(p_title, 200), left(p_body, 1000), left(p_link, 300), p_actor);
end $$;
revoke all on function public.notify_user(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.actor_name() returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), email) from profiles where id = auth.uid()
$$;

-- ---- triggers that create notifications
create or replace function public.tickets_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); ttl text := 'TKT-' || lpad(new.ticket_number::text, 4, '0') || ' · ' || new.subject;
        lnk text := '/tickets?q=' || new.id;
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      perform notify_user(new.workspace_id, new.assigned_to, 'ticket_assigned', 'Ticket assigned to you', ttl, lnk, actor);
    end if;
    return null;
  end if;
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    perform notify_user(new.workspace_id, new.assigned_to, 'ticket_assigned', 'Ticket assigned to you', ttl, lnk, actor);
  end if;
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      perform notify_user(new.workspace_id, new.created_by, 'ticket_resolved', 'Your ticket was resolved', ttl, lnk, actor);
      perform notify_user(new.workspace_id, new.assigned_to, 'ticket_resolved', 'Ticket resolved', ttl, lnk, actor);
    elsif new.status = 'closed' then
      perform notify_user(new.workspace_id, new.created_by, 'ticket_closed', 'Your ticket was closed', ttl, lnk, actor);
      perform notify_user(new.workspace_id, new.assigned_to, 'ticket_closed', 'Ticket closed', ttl, lnk, actor);
    else
      perform notify_user(new.workspace_id, new.assigned_to, 'ticket_status', 'Ticket status changed to ' || replace(new.status, '_', ' '), ttl, lnk, actor);
      perform notify_user(new.workspace_id, new.created_by, 'ticket_status', 'Ticket status changed to ' || replace(new.status, '_', ' '), ttl, lnk, actor);
    end if;
  end if;
  return null;
end $$;
create trigger tickets_notify after insert or update of status, assigned_to on public.support_tickets for each row execute function public.tickets_notify();

create table public.ticket_comments (                      -- remarks on a ticket; append-only
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);
alter table public.ticket_comments enable row level security;
create trigger ticket_comments_immutable before update or delete on public.ticket_comments for each row execute function public.history_is_permanent();
create policy ticket_comments_select on public.ticket_comments for select to authenticated using (exists (select 1 from support_tickets t where t.id = ticket_id));
create policy ticket_comments_insert on public.ticket_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and ((select public.can_do('tickets', 'create')) or (select public.can_do('tickets', 'edit')))
              and exists (select 1 from support_tickets t where t.id = ticket_id));

create or replace function public.ticket_comments_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select * into t from support_tickets where id = new.ticket_id;
  perform notify_user(new.workspace_id, t.assigned_to, 'ticket_remark', 'New remark on a ticket',
                      'TKT-' || lpad(t.ticket_number::text, 4, '0') || ' · ' || left(new.body, 160), '/tickets?q=' || t.id, new.author_id);
  perform notify_user(new.workspace_id, t.created_by, 'ticket_remark', 'New remark on your ticket',
                      'TKT-' || lpad(t.ticket_number::text, 4, '0') || ' · ' || left(new.body, 160), '/tickets?q=' || t.id, new.author_id);
  return null;
end $$;
create trigger ticket_comments_notify after insert on public.ticket_comments for each row execute function public.ticket_comments_notify();

create or replace function public.assignment_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if tg_table_name = 'projects' and new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform notify_user(new.workspace_id, new.assigned_to, 'project_assigned', 'Project assigned to you', new.name, '/projects/' || new.id, actor);
  elsif tg_table_name = 'project_reminders' and new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform notify_user(new.workspace_id, new.assigned_to, 'reminder_assigned', 'Reminder assigned to you', new.title, '/projects/' || new.project_id || '?tab=reminders', actor);
  elsif tg_table_name = 'tasks' and new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform notify_user(new.workspace_id, new.assigned_to, 'task_assigned', 'Task assigned to you', new.title, '/tasks', actor);
  elsif tg_table_name = 'deals' and new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform notify_user(new.workspace_id, new.assigned_to, 'deal_assigned', 'Deal assigned to you', new.title, '/deals/' || new.id, actor);
  end if;
  return null;
end $$;
create trigger assignment_notify after insert or update of assigned_to on public.projects for each row execute function public.assignment_notify();
create trigger assignment_notify after insert or update of assigned_to on public.project_reminders for each row execute function public.assignment_notify();
create trigger assignment_notify after insert or update of assigned_to on public.tasks for each row execute function public.assignment_notify();
create trigger assignment_notify after insert or update of assigned_to on public.deals for each row execute function public.assignment_notify();

-- Live updates: the browser receives new notifications as they're created (when the realtime service is enabled).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when duplicate_object then null; end $$;

-- ============ 2. convert a deal into a project
alter table public.projects add column deal_id uuid references public.deals(id) on delete set null;
create unique index projects_one_per_deal on public.projects (deal_id) where deal_id is not null;

create or replace function public.convert_deal_to_project(p_deal uuid, p jsonb default '{}'::jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare d record; v_id uuid; v_ws uuid := public.current_workspace_id();
begin
  select id, title, description, organization_id, assigned_to, value, currency, expected_close_date, interested_service, workspace_id
    into d from deals where id = p_deal;
  if not found then raise exception 'Deal not found, or you can''t see it.' using errcode = 'P0001'; end if;
  if d.organization_id is null then raise exception 'Link the deal to an organization first. Projects belong to a client.' using errcode = 'P0001'; end if;
  if exists (select 1 from projects where deal_id = p_deal) then raise exception 'This deal already has a project.' using errcode = 'P0001'; end if;
  insert into projects (workspace_id, organization_id, deal_id, name, description, start_date, expected_end_date, priority, assigned_to, notes, created_by)
  values (v_ws, d.organization_id, p_deal,
          coalesce(nullif(btrim(p->>'name'), ''), d.title),
          concat_ws(E'\n\n', nullif(btrim(d.description), ''), case when d.interested_service is not null then 'Service: ' || d.interested_service end),
          coalesce(nullif(p->>'start_date', '')::date, current_date),
          coalesce(nullif(p->>'expected_end_date', '')::date, d.expected_close_date),
          coalesce(nullif(p->>'priority', ''), 'medium'),
          coalesce(nullif(p->>'assigned_to', '')::uuid, d.assigned_to),
          'Converted from deal "' || d.title || '" (' || d.currency || ' ' || d.value || ').',
          auth.uid())
  returning id into v_id;
  insert into project_stages (workspace_id, project_id, position, name)
  select v_ws, v_id, row_number() over (order by t.position), t.name from project_stage_templates t where t.workspace_id = v_ws and t.is_active order by t.position;
  insert into activities (workspace_id, activity_type, title, description, deal_id, organization_id, user_id)
  values (v_ws, 'status_update', 'Converted to project', 'A project was created from this deal (project ' || v_id || ').', p_deal, d.organization_id, auth.uid());
  return v_id;
end $$;
grant execute on function public.convert_deal_to_project(uuid, jsonb) to authenticated;

-- ============ 3. dashboard support feed
create or replace function public.open_tickets_feed() returns setof support_tickets language sql stable security invoker set search_path = public as $$
  select * from support_tickets where status not in ('resolved', 'closed') order by case priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 else 4 end, created_at desc
$$;
grant execute on function public.open_tickets_feed() to authenticated;
