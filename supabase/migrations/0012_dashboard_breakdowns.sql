-- Dashboard breakdowns: lead stages, lead sources and urgent work due today. SECURITY INVOKER, so each user sees only what they may.
create or replace function public.lead_breakdown() returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'by_status', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from leads group by status) s),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'count', x.c) order by x.c desc), '[]'::jsonb)
                    from (select coalesce(source, 'other') source, count(*) c from leads group by 1) x),
    'high_priority_due', (select count(*)::int from tasks where status in ('pending', 'in_progress') and priority = 'high' and due_date <= current_date))
$$;
grant execute on function public.lead_breakdown() to authenticated;
