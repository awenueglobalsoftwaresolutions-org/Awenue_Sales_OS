-- Phase 2: priority sorting, safe organization deletes, atomic lead conversion

-- 1. Sortable priority (high > medium > low)
alter table public.leads add column priority_rank smallint
  generated always as (case priority when 'high' then 3 when 'medium' then 2 else 1 end) stored;
create index leads_priority_rank_idx on public.leads(workspace_id, priority_rank);

-- 2. Block deleting an organization that still has contacts, leads or deals (enforced in the database)
create or replace function public.prevent_org_delete_with_links() returns trigger
language plpgsql security definer set search_path = public as $$
declare c int; l int; d int;
begin
  select count(*) into c from public.contacts where organization_id = old.id;
  select count(*) into l from public.leads    where organization_id = old.id;
  select count(*) into d from public.deals    where organization_id = old.id;
  if c + l + d > 0 then
    raise exception 'This organization still has % contact(s), % lead(s) and % deal(s). Remove or reassign them first.', c, l, d
      using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger organizations_block_delete before delete on public.organizations
  for each row execute function public.prevent_org_delete_with_links();

-- 3. Convert a qualified lead into a contact + deal in one transaction, without duplicates.
--    SECURITY INVOKER: row level security still applies to the caller.
create or replace function public.convert_lead(
  p_lead_id uuid, p_deal_title text, p_deal_value numeric default null, p_currency text default 'USD'
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare l public.leads%rowtype; v_contact uuid; v_deal uuid;
begin
  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found, or you do not have access to it.' using errcode = 'P0001';
  end if;
  if l.converted_deal_id is not null or l.status = 'converted' then
    raise exception 'This lead has already been converted.' using errcode = 'P0001';
  end if;
  if l.status <> 'qualified' then
    raise exception 'Only qualified leads can be converted.' using errcode = 'P0001';
  end if;

  -- reuse an existing contact with the same email instead of creating a duplicate
  v_contact := l.converted_contact_id;
  if v_contact is null and l.email is not null then
    select id into v_contact from public.contacts
      where workspace_id = l.workspace_id and lower(email) = lower(l.email) limit 1;
  end if;
  if v_contact is null then
    insert into public.contacts (workspace_id, organization_id, first_name, last_name, designation, email, phone, country, notes, created_by)
    values (l.workspace_id, l.organization_id, l.first_name, l.last_name, l.job_title, l.email, l.phone, l.country, l.notes, auth.uid())
    returning id into v_contact;
  end if;

  insert into public.deals (workspace_id, title, organization_id, contact_id, lead_id, interested_service, value, currency, stage, assigned_to, created_by)
  values (l.workspace_id,
          coalesce(nullif(trim(p_deal_title), ''), trim(l.first_name || ' ' || coalesce(l.last_name, ''))),
          l.organization_id, v_contact, l.id, l.interested_service,
          coalesce(p_deal_value, l.estimated_budget, 0), upper(coalesce(p_currency, 'USD')),
          'new_lead', l.assigned_to, auth.uid())
  returning id into v_deal;

  update public.leads
     set status = 'converted', converted_contact_id = v_contact, converted_deal_id = v_deal, converted_at = now()
   where id = l.id;

  insert into public.activities (workspace_id, activity_type, title, description, lead_id, contact_id, deal_id, organization_id, user_id)
  values (l.workspace_id, 'status_update', 'Lead converted to a deal', 'Status changed to Converted. Contact and deal created.',
          l.id, v_contact, v_deal, l.organization_id, auth.uid());

  return jsonb_build_object('deal_id', v_deal, 'contact_id', v_contact);
end $$;
grant execute on function public.convert_lead(uuid, text, numeric, text) to authenticated;
