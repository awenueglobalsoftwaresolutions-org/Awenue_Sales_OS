-- Phase 3: deal stage side effects, task completion tracking, task priority sorting

alter table public.tasks add column priority_rank smallint
  generated always as (case priority when 'high' then 3 when 'medium' then 2 else 1 end) stored;
create index tasks_priority_rank_idx on public.tasks(workspace_id, priority_rank);

-- ---------- deals: won/lost dates are set by the database, whichever screen changes the stage ----------
create or replace function public.deals_stage_effects() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.stage = 'won'  and new.won_at  is null then new.won_at  := now(); end if;
    if new.stage = 'lost' and new.lost_at is null then new.lost_at := now(); end if;
  elsif new.stage is distinct from old.stage then
    new.won_at  := case when new.stage = 'won'  then now() end;
    new.lost_at := case when new.stage = 'lost' then now() end;
    if new.stage <> 'lost' then new.lost_reason := null; end if;
  end if;
  return new;
end $$;
create trigger deals_stage_effects before insert or update of stage on public.deals
  for each row execute function public.deals_stage_effects();

-- every stage change lands in the deal's history (and the organization's / contact's timeline)
create or replace function public.deals_log_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.activities (workspace_id, activity_type, title, description, deal_id, organization_id, contact_id, user_id)
    values (new.workspace_id, 'status_update',
            'Stage changed to ' || initcap(replace(new.stage, '_', ' ')),
            'Previously ' || initcap(replace(old.stage, '_', ' ')) || '.'
              || case when new.stage = 'lost' and new.lost_reason is not null then ' Reason: ' || new.lost_reason else '' end,
            new.id, new.organization_id, new.contact_id, auth.uid());
  end if;
  return new;
end $$;
create trigger deals_log_stage_change after update of stage on public.deals
  for each row execute function public.deals_log_stage_change();

-- ---------- tasks ----------
create or replace function public.tasks_status_effects() returns trigger language plpgsql as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' then
      new.completed_at := now();
    elsif old.status <> 'completed' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger tasks_status_effects before insert or update of status on public.tasks
  for each row execute function public.tasks_status_effects();

create or replace function public.tasks_log_completion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status <> 'completed'
     and (new.lead_id is not null or new.contact_id is not null or new.organization_id is not null or new.deal_id is not null) then
    insert into public.activities (workspace_id, activity_type, title, lead_id, contact_id, organization_id, deal_id, user_id)
    values (new.workspace_id, 'task_completion', 'Task completed: ' || new.title,
            new.lead_id, new.contact_id, new.organization_id, new.deal_id, auth.uid());
  end if;
  return new;
end $$;
create trigger tasks_log_completion after update of status on public.tasks
  for each row execute function public.tasks_log_completion();
