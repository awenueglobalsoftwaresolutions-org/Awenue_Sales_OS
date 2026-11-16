-- Reports & Audits: append-only audit trail, IP/device capture, report queries, retention.

-- ============ 1. helpers ============
-- Remove anything that looks like a secret before it can be stored.
create or replace function public.scrub_json(j jsonb) returns jsonb language plpgsql immutable as $$
declare k text; v jsonb; out jsonb;
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'object' then
    out := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      if k ~* '(password|passwd|secret|token|api[_-]?key|authorization|credential|private[_-]?key|service[_-]?role)' then
        out := out || jsonb_build_object(k, '[redacted]');
      else
        out := out || jsonb_build_object(k, public.scrub_json(v));
      end if;
    end loop;
    return out;
  elsif jsonb_typeof(j) = 'array' then
    return coalesce((select jsonb_agg(public.scrub_json(e)) from jsonb_array_elements(j) e), '[]'::jsonb);
  end if;
  return j;
end $$;

create or replace function public.parse_ua(ua text) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'browser', case
      when ua is null then null
      when ua ~* 'edg(e|a|ios)?/' then 'Edge'
      when ua ~* 'opr/|opera' then 'Opera'
      when ua ~* 'firefox|fxios' then 'Firefox'
      when ua ~* 'chrome|crios|chromium' then 'Chrome'
      when ua ~* 'safari' then 'Safari'
      when ua ~* 'msie|trident' then 'Internet Explorer'
      when ua ~* 'curl|postman|python|node|axios|okhttp|insomnia' then 'API client'
      else 'Other' end,
    'os', case
      when ua is null then null
      when ua ~* 'iphone|ipad|ipod' then 'iOS'
      when ua ~* 'android' then 'Android'
      when ua ~* 'windows' then 'Windows'
      when ua ~* 'cros' then 'ChromeOS'
      when ua ~* 'mac os x|macintosh' then 'macOS'
      when ua ~* 'linux|x11' then 'Linux'
      else 'Other' end,
    'device', case
      when ua is null then null
      when ua ~* 'ipad|tablet' or (ua ~* 'android' and ua !~* 'mobile') then 'Tablet'
      when ua ~* 'mobile|iphone|ipod|android' then 'Mobile'
      else 'Desktop' end)
$$;

-- The caller's address as seen by the server. cf-connecting-ip is set by Cloudflare and cannot be supplied by the client;
-- x-forwarded-for can be, so it is only a fallback and is flagged as unverified.
create or replace function public.request_origin() returns jsonb language plpgsql stable as $$
declare h jsonb; raw text; src text; ip text;
begin
  begin h := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb; exception when others then h := '{}'::jsonb; end;
  raw := nullif(btrim(h->>'cf-connecting-ip'), ''); src := 'cf-connecting-ip';
  if raw is null then raw := nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''); src := 'x-forwarded-for'; end if;
  if raw is null then return jsonb_build_object('ip', null, 'ip_source', null, 'ua', nullif(h->>'user-agent', '')); end if;
  if raw ~ '^\d{1,3}(\.\d{1,3}){3}(:\d+)?$' then ip := split_part(raw, ':', 1);
  elsif raw ~ '^[0-9a-fA-F:.]{2,45}$' and raw like '%:%' then ip := lower(raw);
  else ip := null; end if;
  return jsonb_build_object('ip', ip, 'ip_source', case when ip is null then null else src end, 'ua', nullif(h->>'user-agent', ''));
end $$;

-- ============ 2. tables ============
alter table public.workspaces add column audit_retention_days int not null default 365 check (audit_retention_days between 30 and 3650);

create table public.ip_geo_cache (
  ip text primary key, country text, region text, city text, isp text, last_seen timestamptz not null default now()
);
alter table public.ip_geo_cache enable row level security;      -- no policies: only server-side code reads or writes it

create table public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid,                                  -- no foreign key: history must survive removing a user
  username text not null,
  action text not null,
  module text not null,
  record_id text,
  description text not null default '',
  previous_data jsonb,
  updated_data jsonb,
  created_at timestamptz not null default now(), -- UTC
  ip_address text, country text, region text, city text, isp text,
  browser text, device text, os text, user_agent text,
  status text not null default 'success' check (status in ('success','failed')),
  metadata jsonb not null default '{}'::jsonb
);
create index audit_ws_created_idx on public.audit_logs (workspace_id, created_at desc);
create index audit_user_created_idx on public.audit_logs (workspace_id, user_id, created_at desc);
create index audit_module_idx on public.audit_logs (workspace_id, module, created_at desc);
create index audit_action_idx on public.audit_logs (workspace_id, action, created_at desc);
create index audit_ip_idx on public.audit_logs (workspace_id, ip_address);

alter table public.audit_logs enable row level security;
-- Everyone sees their own trail; reports.view adds their team; reports.manage sees everyone. Nobody can insert, update or delete through the API.
create policy audit_select on public.audit_logs for select to authenticated using (
  workspace_id = (select public.current_workspace_id()) and (
    user_id = (select auth.uid())
    or (select public.has_permission('reports.manage'))
    or ((select public.has_permission('reports.view')) and public.is_team_member(user_id))));

-- Append-only, enforced for every role: rows can only be removed by purge_audit_logs() under the retention policy.
create or replace function public.audit_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.audit_purge', true), '') = 'on' then return old; end if;
  raise exception 'Audit records can''t be changed or deleted.' using errcode = 'P0001';
end $$;
create trigger audit_immutable before update or delete on public.audit_logs for each row execute function public.audit_immutable();
create or replace function public.audit_no_truncate() returns trigger language plpgsql as $$
begin raise exception 'Audit records can''t be truncated.' using errcode = 'P0001'; end $$;
create trigger audit_no_truncate before truncate on public.audit_logs for each statement execute function public.audit_no_truncate();

-- ============ 3. writing events ============
create or replace function public.audit_write(
  p_ws uuid, p_user uuid, p_username text, p_action text, p_module text, p_record text, p_description text,
  p_prev jsonb, p_new jsonb, p_status text, p_meta jsonb, p_ip text, p_ua text, p_geo jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare ua jsonb := public.parse_ua(p_ua); g_country text; g_region text; g_city text; g_isp text;
begin
  if p_ip is not null then
    select country, region, city, isp into g_country, g_region, g_city, g_isp from ip_geo_cache where ip = p_ip;
  end if;
  insert into audit_logs (workspace_id, user_id, username, action, module, record_id, description, previous_data, updated_data, status, metadata,
                          ip_address, country, region, city, isp, browser, device, os, user_agent)
  values (p_ws, p_user, coalesce(nullif(p_username, ''), 'System'), p_action, p_module, p_record, coalesce(p_description, ''),
          public.scrub_json(p_prev), public.scrub_json(p_new), coalesce(p_status, 'success'), coalesce(public.scrub_json(p_meta), '{}'::jsonb),
          p_ip, coalesce(p_geo->>'country', g_country), coalesce(p_geo->>'region', g_region), coalesce(p_geo->>'city', g_city), coalesce(p_geo->>'isp', g_isp),
          ua->>'browser', ua->>'device', ua->>'os', left(p_ua, 400));
end $$;
revoke all on function public.audit_write(uuid, uuid, text, text, text, text, text, jsonb, jsonb, text, jsonb, text, text, jsonb) from public, anon, authenticated;

-- Automatic trail for data changes: who, what, before and after.
create or replace function public.audit_row_change() returns trigger language plpgsql security definer set search_path = public as $$
declare m text := tg_argv[0]; actor uuid := auth.uid(); o jsonb; n jsonb; j jsonb; prev jsonb; nw jsonb; changed text[]; ws uuid;
        label text; org jsonb := public.request_origin(); uname text; rec text;
begin
  if tg_op = 'INSERT' then n := to_jsonb(new); j := n;
  elsif tg_op = 'DELETE' then o := to_jsonb(old); j := o;
  else
    o := to_jsonb(old); n := to_jsonb(new); j := n;
    select array_agg(key order by key), jsonb_object_agg(key, o -> key), jsonb_object_agg(key, value) into changed, prev, nw
      from jsonb_each(n) where o -> key is distinct from value and key not in ('updated_at', 'priority_rank', 'balance');
    if changed is null then return null; end if;                  -- nothing meaningful changed
  end if;
  ws := coalesce((j->>'workspace_id')::uuid, (select workspace_id from roles where id = (j->>'role_id')::uuid), (select workspace_id from profiles where id = actor), (select id from workspaces order by created_at limit 1));
  rec := coalesce(j->>'id', j->>'role_id');
  label := coalesce(nullif(j->>'name', ''), nullif(j->>'title', ''), nullif(j->>'invoice_number', ''), nullif(btrim(concat_ws(' ', j->>'first_name', j->>'last_name')), ''), nullif(j->>'permission', ''));
  select coalesce(nullif(full_name, ''), email) into uname from profiles where id = actor;
  perform audit_write(ws, actor, coalesce(uname, case when actor is null then 'System' else 'Unknown user' end),
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end, m, rec,
    case tg_op when 'INSERT' then 'Created ' when 'UPDATE' then 'Updated ' else 'Deleted ' end || replace(tg_table_name, '_', ' ')
      || coalesce(' "' || label || '"', '') || case when tg_op = 'UPDATE' then ' (' || array_to_string(changed, ', ') || ')' else '' end,
    case when tg_op = 'DELETE' then o when tg_op = 'UPDATE' then prev end,
    case when tg_op = 'INSERT' then n when tg_op = 'UPDATE' then nw end,
    'success', jsonb_build_object('table', tg_table_name, 'ip_source', org->>'ip_source'), org->>'ip', org->>'ua', null);
  return null;
end $$;

do $$
declare t record;
begin
  for t in select * from (values ('organizations','organizations'), ('contacts','contacts'), ('leads','leads'), ('deals','deals'), ('tasks','tasks'),
      ('org_items','files'), ('profiles','users'), ('roles','roles'), ('role_permissions','roles'), ('services','settings'), ('workspaces','settings')) as v(tbl, module)
  loop
    execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.audit_row_change(%L)', t.tbl, t.module);
  end loop;
end $$;

-- Client-side events (logout, exports, report downloads...). The user and IP come from the server, never from the caller.
create or replace function public.log_event(p_action text, p_module text, p_record text default null, p_description text default null, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); p record; org jsonb := public.request_origin();
begin
  if actor is null then raise exception 'Sign in first.' using errcode = 'P0001'; end if;
  if p_action not in ('logout', 'export', 'report_generated', 'report_downloaded', 'invoice_downloaded') then
    raise exception 'That event type can''t be recorded from the app.' using errcode = 'P0001';
  end if;
  select workspace_id, coalesce(nullif(full_name, ''), email) as name into p from profiles where id = actor and is_active;
  if p is null then raise exception 'Your account is not active.' using errcode = 'P0001'; end if;
  perform audit_write(p.workspace_id, actor, p.name, p_action, left(p_module, 40), left(p_record, 80), left(p_description, 500), null, null, 'success',
                      coalesce(p_metadata, '{}'::jsonb), org->>'ip', org->>'ua', null);
end $$;
revoke all on function public.log_event(text, text, text, text, jsonb) from public, anon;
grant execute on function public.log_event(text, text, text, text, jsonb) to authenticated;

-- Server-side events from the Cloudflare Worker (sign-ins, failed sign-ins, user management). Service role only.
create or replace function public.log_event_service(
  p_user uuid, p_username text, p_action text, p_module text, p_record text, p_description text, p_status text, p_metadata jsonb,
  p_ip text, p_ua text, p_country text, p_region text, p_city text, p_isp text
) returns void language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select coalesce((select workspace_id from profiles where id = p_user), (select id from workspaces order by created_at limit 1)) into ws;
  if p_ip is not null and (p_country is not null or p_city is not null) then
    insert into ip_geo_cache (ip, country, region, city, isp, last_seen) values (p_ip, p_country, p_region, p_city, p_isp, now())
    on conflict (ip) do update set country = excluded.country, region = excluded.region, city = excluded.city, isp = excluded.isp, last_seen = now();
  end if;
  perform audit_write(ws, p_user, p_username, p_action, p_module, p_record, p_description, null, null, p_status,
                      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('ip_source', 'cf-connecting-ip'), p_ip, p_ua,
                      jsonb_build_object('country', p_country, 'region', p_region, 'city', p_city, 'isp', p_isp));
end $$;
revoke all on function public.log_event_service(uuid, text, text, text, text, text, text, jsonb, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.log_event_service(uuid, text, text, text, text, text, text, jsonb, text, text, text, text, text, text) to service_role;

-- Remember where an address is (so later events from it can show a location). Service role only.
create or replace function public.remember_ip_geo(p_ip text, p_country text, p_region text, p_city text, p_isp text) returns void
language sql security definer set search_path = public as $$
  insert into ip_geo_cache (ip, country, region, city, isp) values (p_ip, p_country, p_region, p_city, p_isp)
  on conflict (ip) do update set country = excluded.country, region = excluded.region, city = excluded.city, isp = excluded.isp, last_seen = now()
$$;
revoke all on function public.remember_ip_geo(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.remember_ip_geo(text, text, text, text, text) to service_role;

-- Sign-in throttling input: recent failures from this address or for this email. Service role only.
create or replace function public.recent_failed_logins(p_ip text, p_email text, p_minutes int) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from audit_logs where action = 'login_failed' and created_at > now() - make_interval(mins => p_minutes)
    and ((p_ip is not null and ip_address = p_ip) or (p_email is not null and lower(username) = lower(p_email)))
$$;
revoke all on function public.recent_failed_logins(text, text, int) from public, anon, authenticated;
grant execute on function public.recent_failed_logins(text, text, int) to service_role;

-- ============ 4. report queries (SECURITY INVOKER: access follows the audit_select policy) ============
create or replace function public.audit_filtered(
  p_user_id uuid, p_user_text text, p_from timestamptz, p_to timestamptz, p_time_from time, p_time_to time, p_tz text,
  p_module text, p_action text, p_status text, p_ip text, p_location text, p_search text
) returns setof public.audit_logs language sql stable security invoker set search_path = public as $$
  select * from audit_logs a
   where (p_user_id is null or a.user_id = p_user_id)
     and (p_user_text is null or a.username ilike '%' || p_user_text || '%' or a.user_id::text = p_user_text)
     and (p_from is null or a.created_at >= p_from) and (p_to is null or a.created_at < p_to)
     and (p_time_from is null or p_time_to is null or case
            when p_time_from <= p_time_to then (a.created_at at time zone coalesce(p_tz, 'UTC'))::time between p_time_from and p_time_to
            else (a.created_at at time zone coalesce(p_tz, 'UTC'))::time >= p_time_from or (a.created_at at time zone coalesce(p_tz, 'UTC'))::time <= p_time_to end)
     and (p_module is null or a.module = p_module) and (p_action is null or a.action = p_action) and (p_status is null or a.status = p_status)
     and (p_ip is null or a.ip_address like p_ip || '%')
     and (p_location is null or concat_ws(' ', a.city, a.region, a.country) ilike '%' || p_location || '%')
     and (p_search is null or a.description ilike '%' || p_search || '%' or a.action ilike '%' || p_search || '%' or a.username ilike '%' || p_search || '%')
$$;

create or replace function public.audit_search(
  p_user_id uuid, p_user_text text, p_from timestamptz, p_to timestamptz, p_time_from time, p_time_to time, p_tz text,
  p_module text, p_action text, p_status text, p_ip text, p_location text, p_search text,
  p_sort text default 'created_at', p_dir text default 'desc', p_limit int default 25, p_offset int default 0
) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare total bigint; rows jsonb; col text; dir text := case when lower(p_dir) = 'asc' then 'asc' else 'desc' end;
begin
  col := case when p_sort in ('created_at', 'username', 'action', 'module', 'ip_address', 'country', 'city', 'status', 'browser', 'device') then p_sort else 'created_at' end;
  select count(*) into total from audit_filtered(p_user_id, p_user_text, p_from, p_to, p_time_from, p_time_to, p_tz, p_module, p_action, p_status, p_ip, p_location, p_search);
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from audit_filtered($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) order by %I %s nulls last, id %s limit $14 offset $15) t', col, dir, dir)
    using p_user_id, p_user_text, p_from, p_to, p_time_from, p_time_to, p_tz, p_module, p_action, p_status, p_ip, p_location, p_search, least(greatest(p_limit, 1), 1000), greatest(p_offset, 0)
    into rows;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

create or replace function public.audit_summary(
  p_user_id uuid, p_user_text text, p_from timestamptz, p_to timestamptz, p_time_from time, p_time_to time, p_tz text,
  p_module text, p_action text, p_status text, p_ip text, p_location text, p_search text
) returns jsonb language sql stable security invoker set search_path = public as $$
  with f as (select * from audit_filtered(p_user_id, p_user_text, p_from, p_to, p_time_from, p_time_to, p_tz, p_module, p_action, p_status, p_ip, p_location, p_search))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'success', (select count(*) from f where status = 'success'),
    'failed', (select count(*) from f where status = 'failed'),
    'failed_logins', (select count(*) from f where action = 'login_failed'),
    'created', (select count(*) from f where action = 'create'),
    'updated', (select count(*) from f where action = 'update'),
    'deleted', (select count(*) from f where action = 'delete'),
    'emails_sent', (select count(*) from f where action = 'email_sent'),
    'whatsapp_sent', (select count(*) from f where action = 'whatsapp_sent'),
    'first_at', (select min(created_at) from f), 'last_at', (select max(created_at) from f),
    'unique_ips', (select count(distinct ip_address) from f where ip_address is not null),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object('location', loc, 'count', c) order by c desc), '[]'::jsonb)
                    from (select nullif(concat_ws(', ', city, region, country), '') as loc, count(*) c from f where ip_address is not null group by 1) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb)
                 from (select to_char((created_at at time zone coalesce(p_tz, 'UTC'))::date, 'YYYY-MM-DD') d, count(*) c from f group by 1) x),
    'by_module', (select coalesce(jsonb_agg(jsonb_build_object('module', module, 'count', c) order by c desc), '[]'::jsonb) from (select module, count(*) c from f group by 1) x),
    'by_hour', (select jsonb_agg(jsonb_build_object('hour', h, 'count', coalesce(x.c, 0)) order by h)
                  from generate_series(0, 23) h left join (select extract(hour from created_at at time zone coalesce(p_tz, 'UTC'))::int hr, count(*) c from f group by 1) x on x.hr = h),
    'auth_history', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
                       from (select created_at, action, status, ip_address, city, country, browser, device from f where action in ('login', 'logout', 'login_failed') order by created_at desc limit 200) a))
$$;
grant execute on function public.audit_filtered(uuid, text, timestamptz, timestamptz, time, time, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.audit_search(uuid, text, timestamptz, timestamptz, time, time, text, text, text, text, text, text, text, text, text, int, int) to authenticated;
grant execute on function public.audit_summary(uuid, text, timestamptz, timestamptz, time, time, text, text, text, text, text, text, text) to authenticated;

-- ============ 5. retention ============
create or replace function public.set_audit_retention(p_days int) returns void language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); ws uuid := public.current_workspace_id(); org jsonb := public.request_origin(); uname text;
begin
  if not public.has_permission('reports.manage') then raise exception 'You don''t have permission to change the retention policy.' using errcode = 'P0001'; end if;
  if p_days not between 30 and 3650 then raise exception 'Keep audit records for between 30 and 3650 days.' using errcode = 'P0001'; end if;
  update workspaces set audit_retention_days = p_days where id = ws;
  select coalesce(nullif(full_name, ''), email) into uname from profiles where id = actor;
  perform audit_write(ws, actor, uname, 'update', 'reports', null, 'Changed audit retention to ' || p_days || ' days', null, null, 'success', '{}'::jsonb, org->>'ip', org->>'ua', null);
end $$;

create or replace function public.purge_audit_logs() returns bigint language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); ws uuid := public.current_workspace_id(); days int; n bigint; org jsonb := public.request_origin(); uname text;
begin
  if not public.has_permission('reports.manage') then raise exception 'You don''t have permission to purge audit records.' using errcode = 'P0001'; end if;
  select audit_retention_days into days from workspaces where id = ws;
  perform set_config('app.audit_purge', 'on', true);
  delete from audit_logs where workspace_id = ws and created_at < now() - make_interval(days => days);
  get diagnostics n = row_count;
  perform set_config('app.audit_purge', 'off', true);
  select coalesce(nullif(full_name, ''), email) into uname from profiles where id = actor;
  perform audit_write(ws, actor, uname, 'purge', 'reports', null, 'Deleted ' || n || ' audit records older than ' || days || ' days', null, null, 'success', '{}'::jsonb, org->>'ip', org->>'ua', null);
  return n;
end $$;
revoke all on function public.set_audit_retention(int), public.purge_audit_logs() from public, anon;
grant execute on function public.set_audit_retention(int), public.purge_audit_logs() to authenticated;
-- To purge automatically every night (Supabase > Database > Extensions > pg_cron), run once in the SQL editor:
--   select cron.schedule('purge-audit', '15 3 * * *', $$ delete from public.audit_logs ... $$);
-- (the purge function needs a signed-in user, so use the Reports > Retention button, or schedule a Worker cron that calls it.)
