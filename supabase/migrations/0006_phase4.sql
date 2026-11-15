-- Phase 4: dashboard aggregates, last-admin protection

-- All dashboard numbers come from the database. SECURITY INVOKER: row level security applies,
-- so each user's dashboard reflects only the records they are allowed to see.
create or replace function public.dashboard_stats(p_today date, p_month_start date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total_leads',        (select count(*) from leads),
    'new_leads_month',    (select count(*) from leads where created_at >= p_month_start),
    'qualified_leads',    (select count(*) from leads where status = 'qualified'),
    'active_deals',       (select count(*) from deals where stage not in ('won','lost')),
    'won_deals',          (select count(*) from deals where stage = 'won'),
    'lost_deals',         (select count(*) from deals where stage = 'lost'),
    'pipeline_value',     (select coalesce(jsonb_object_agg(currency, v), '{}'::jsonb)
                             from (select currency, sum(value) v from deals where stage not in ('won','lost') group by currency) a),
    'closed_revenue',     (select coalesce(jsonb_object_agg(currency, v), '{}'::jsonb)
                             from (select currency, sum(value) v from deals where stage = 'won' group by currency) b),
    'upcoming_followups', (select count(*) from tasks where status in ('pending','in_progress') and due_date >= p_today and due_date <= p_today + 7),
    'overdue_tasks',      (select count(*) from tasks where status in ('pending','in_progress') and due_date < p_today),
    'leads_by_month',     (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon YY'), 'count', c) order by m), '[]'::jsonb)
                             from (select gs as m, (select count(*) from leads l where date_trunc('month', l.created_at) = gs) as c
                                     from generate_series(date_trunc('month', p_month_start::timestamptz) - interval '5 months',
                                                          date_trunc('month', p_month_start::timestamptz), interval '1 month') gs) t),
    'deals_by_stage',     (select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'currency', currency, 'count', c, 'value', v)), '[]'::jsonb)
                             from (select stage, currency, count(*) c, sum(value) v from deals group by stage, currency) s)
  )
$$;
grant execute on function public.dashboard_stats(date, date) to authenticated;

-- A workspace must always keep at least one active admin.
create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
    if not exists (select 1 from public.profiles where workspace_id = old.workspace_id and role = 'admin' and is_active and id <> old.id) then
      raise exception 'The workspace needs at least one active admin.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect_last_admin before update of role, is_active on public.profiles
  for each row execute function public.protect_last_admin();
