-- Security and repair migration (follows 0015).
-- 1. 0015 created the default workspace directly, so it never received roles or services. Sign-up would then fail on profiles_role_fk.
-- 2. 0015 gave the public anonymous key read, change and delete rights over website leads and enquiries. Removed: intake must use the server-side key.

-- ---- 1. repair workspaces that have no roles or services
select public.seed_default_roles(w.id) from public.workspaces w
 where not exists (select 1 from public.roles r where r.workspace_id = w.id);

insert into public.services (workspace_id, name, sort_order)
select w.id, s.name, s.ord
  from public.workspaces w
 cross join (values ('Web Development', 1), ('SaaS Development', 2), ('Mobile App Development', 3), ('AI & Automation', 4),
                    ('Digital Marketing', 5), ('Graphic Design & Branding', 6), ('IT Consultancy', 7), ('Other', 8)) as s(name, ord)
 where not exists (select 1 from public.services x where x.workspace_id = w.id)
on conflict (workspace_id, name) do nothing;

-- ---- 2. remove anonymous access
drop policy if exists leads_anon_insert on public.leads;
drop policy if exists leads_anon_select on public.leads;
drop policy if exists leads_anon_update on public.leads;
drop policy if exists website_enquiries_anon_all on public.website_enquiries;
drop policy if exists website_contacts_anon_all on public.website_contact_messages;
drop policy if exists workspaces_anon_select on public.workspaces;
revoke execute on function public.get_or_create_default_workspace() from anon;

-- ---- 3. first-user bootstrap. The first person in a workspace becomes its Super Admin (as designed in 0007).
-- Before this, the rule was "no workspace exists", which 0015 broke by creating the default workspace in advance.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid; new_role text; active boolean;
begin
  select id into ws from public.workspaces order by created_at limit 1;
  if ws is null then
    insert into public.workspaces (name) values ('Awenue Global Software Solutions') returning id into ws;
  end if;
  perform public.seed_default_roles(ws);
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
