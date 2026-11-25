-- AWENUE SALES OS — Resilient Workspace Resolution & Webhook Ingestion
-- Ensures workspaces table has is_active and slug columns, seed default workspace,
-- and grants necessary access for webhook form submissions.

-- 1. Ensure columns exist on public.workspaces
alter table public.workspaces add column if not exists is_active boolean not null default true;
alter table public.workspaces add column if not exists slug text;

-- 2. Ensure default primary workspace exists and is active
insert into public.workspaces (id, name, slug, is_active, created_at, updated_at)
values (
  '20081013-fea5-45bd-870e-b644d02edd43',
  'AWENUE Global HQ',
  'awenue-hq',
  true,
  now(),
  now()
)
on conflict (id) do update set
  is_active = true,
  name = coalesce(public.workspaces.name, 'AWENUE Global HQ'),
  slug = coalesce(public.workspaces.slug, 'awenue-hq');

-- Ensure all workspaces have is_active set to true
update public.workspaces set is_active = true where is_active is distinct from true;

-- 3. Resilient workspace resolver function
create or replace function public.get_or_create_default_workspace()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ws_id uuid;
begin
  -- 1. Check for active workspace
  select id into ws_id from public.workspaces where is_active = true order by created_at limit 1;
  if ws_id is not null then return ws_id; end if;

  -- 2. Fallback: Any existing workspace
  select id into ws_id from public.workspaces order by created_at limit 1;
  if ws_id is not null then
    update public.workspaces set is_active = true where id = ws_id;
    return ws_id;
  end if;

  -- 3. Fallback: Auto-create default workspace if table is completely empty
  insert into public.workspaces (id, name, slug, is_active)
  values ('20081013-fea5-45bd-870e-b644d02edd43', 'AWENUE Global HQ', 'awenue-hq', true)
  returning id into ws_id;

  return ws_id;
end $$;

grant execute on function public.get_or_create_default_workspace() to anon, authenticated, service_role;

-- 4. Anonymous policies for public website webhook ingestion
drop policy if exists workspaces_anon_select on public.workspaces;
create policy workspaces_anon_select on public.workspaces
  for select to anon using (is_active = true);

drop policy if exists leads_anon_insert on public.leads;
create policy leads_anon_insert on public.leads
  for insert to anon with check (source = 'website');

drop policy if exists leads_anon_select on public.leads;
create policy leads_anon_select on public.leads
  for select to anon using (source = 'website');

drop policy if exists leads_anon_update on public.leads;
create policy leads_anon_update on public.leads
  for update to anon using (source = 'website');

drop policy if exists website_enquiries_anon_all on public.website_enquiries;
create policy website_enquiries_anon_all on public.website_enquiries
  for all to anon using (true) with check (true);

drop policy if exists website_contacts_anon_all on public.website_contact_messages;
create policy website_contacts_anon_all on public.website_contact_messages
  for all to anon using (true) with check (true);
