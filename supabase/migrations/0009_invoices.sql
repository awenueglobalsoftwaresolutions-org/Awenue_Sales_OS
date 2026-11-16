-- Invoice management: settings, numbering, drafts, finalization rules, payments, history.

-- ============ 1. 'approve' on invoices means: send/finalize, cancel and void payments ============
create or replace function public.seed_default_roles(p_ws uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r_super uuid; r_admin uuid; r_mgr uuid; r_rep uuid;
begin
  insert into roles (workspace_id, key, name, description, is_system) values
    (p_ws, 'super_admin',     'Super Admin',          'Full system access, users, roles and integrations', true),
    (p_ws, 'admin',           'Admin',                'Administrative access without role and integration control', true),
    (p_ws, 'sales_manager',   'Sales Manager',        'Manages sales records and teams', true),
    (p_ws, 'sales_executive', 'Sales Representative', 'Works on their own leads, deals and tasks', true)
  on conflict (workspace_id, key) do nothing;
  select id into r_super from roles where workspace_id = p_ws and key = 'super_admin';
  select id into r_admin from roles where workspace_id = p_ws and key = 'admin';
  select id into r_mgr   from roles where workspace_id = p_ws and key = 'sales_manager';
  select id into r_rep   from roles where workspace_id = p_ws and key = 'sales_executive';
  insert into role_permissions select r_super, key from permissions on conflict do nothing;
  insert into role_permissions select r_admin, key from permissions where key not in ('roles.manage', 'integrations.manage', 'users.manage', 'users.delete') on conflict do nothing;
  insert into role_permissions select r_mgr, key from permissions where key in (
    'dashboard.view',
    'leads.view','leads.create','leads.edit','leads.delete','leads.manage','leads.export','leads.assign',
    'deals.view','deals.create','deals.edit','deals.delete','deals.manage','deals.export','deals.assign',
    'tasks.view','tasks.create','tasks.edit','tasks.delete','tasks.manage','tasks.assign',
    'organizations.view','organizations.create','organizations.edit','organizations.delete','organizations.export',
    'contacts.view','contacts.create','contacts.edit','contacts.delete','contacts.export',
    'files.view','files.create','files.edit','files.delete','files.manage',
    'activities.view','activities.create','activities.delete','activities.manage',
    'reports.view','invoices.view','invoices.create','invoices.edit','invoices.export','invoices.approve',
    'communications.view','communications.create',
    'users.view','roles.view','settings.view') on conflict do nothing;
  insert into role_permissions select r_rep, key from permissions where key in (
    'dashboard.view',
    'leads.view','leads.create','leads.edit','leads.delete','leads.export',
    'deals.view','deals.create','deals.edit','deals.delete','deals.export',
    'tasks.view','tasks.create','tasks.edit','tasks.delete',
    'organizations.view','organizations.create','organizations.edit','organizations.export',
    'contacts.view','contacts.create','contacts.edit','contacts.export',
    'files.view','files.create','files.edit','files.delete',
    'activities.view','activities.create','activities.delete',
    'invoices.view','invoices.create','invoices.edit',
    'communications.view','communications.create') on conflict do nothing;
end $$;
revoke all on function public.seed_default_roles(uuid) from public, anon, authenticated;
select public.seed_default_roles(id) from public.workspaces;

-- ============ 2. company settings (the "From" side of every invoice) ============
create table public.invoice_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  company_name text, address text, email text, phone text, website text, tax_id text, logo_url text,
  default_currency text not null default 'USD' check (char_length(default_currency) = 3),
  default_tax_rate numeric(5,2) not null default 0 check (default_tax_rate between 0 and 100),
  default_due_days int not null default 14 check (default_due_days between 0 and 365),
  number_prefix text not null default 'INV' check (number_prefix ~ '^[A-Za-z0-9-]{1,12}$'),
  payment_instructions text, terms text,
  updated_at timestamptz not null default now()
);
insert into public.invoice_settings (workspace_id, company_name) select id, name from public.workspaces on conflict do nothing;
create trigger set_updated_at before update on public.invoice_settings for each row execute function public.set_updated_at();
create or replace function public.workspace_invoice_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into invoice_settings (workspace_id, company_name) values (new.id, new.name) on conflict do nothing; return new; end $$;
create trigger workspace_invoice_settings after insert on public.workspaces for each row execute function public.workspace_invoice_settings();

alter table public.invoice_settings enable row level security;
create policy invoice_settings_select on public.invoice_settings for select to authenticated
  using (workspace_id = (select public.current_workspace_id()) and ((select public.can_do('invoices', 'view')) or (select public.can_do('settings', 'view'))));
create policy invoice_settings_write on public.invoice_settings for all to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (select public.can_do('settings', 'manage')))
  with check (workspace_id = (select public.current_workspace_id()) and (select public.can_do('settings', 'manage')));

create table public.invoice_counters (workspace_id uuid not null references public.workspaces(id) on delete cascade, year int not null, last_value int not null default 0, primary key (workspace_id, year));
alter table public.invoice_counters enable row level security;     -- no policies: only the numbering function touches it

create or replace function public.next_invoice_number(p_ws uuid, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare y int := extract(year from p_date); n int; pre text;
begin
  insert into invoice_counters (workspace_id, year, last_value) values (p_ws, y, 1)
    on conflict (workspace_id, year) do update set last_value = invoice_counters.last_value + 1 returning last_value into n;
  select number_prefix into pre from invoice_settings where workspace_id = p_ws;
  return coalesce(pre, 'INV') || '-' || y || '-' || lpad(n::text, 4, '0');
end $$;
revoke all on function public.next_invoice_number(uuid, date) from public, anon, authenticated;

create or replace function public.invoice_issuer(p_ws uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('company_name', company_name, 'address', address, 'email', email, 'phone', phone, 'website', website, 'tax_id', tax_id, 'logo_url', logo_url)
                     from invoice_settings where workspace_id = p_ws), '{}'::jsonb)
$$;
revoke all on function public.invoice_issuer(uuid) from public, anon, authenticated;

-- ============ 3. invoices ============
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_number text not null,
  status text not null default 'draft' check (status in ('draft','sent','partially_paid','paid','cancelled')),   -- "overdue" is derived: sent/partially paid and past due
  organization_id uuid references public.organizations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  bill_to_name text not null check (char_length(btrim(bill_to_name)) between 1 and 200),
  bill_to_email text, bill_to_phone text, bill_to_address text, bill_to_tax_id text,
  issue_date date not null default current_date,
  due_date date not null,
  currency text not null default 'USD' check (char_length(currency) = 3),
  subtotal numeric(14,2) not null default 0, discount_total numeric(14,2) not null default 0, tax_total numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  balance numeric(14,2) generated always as (total - amount_paid) stored,
  notes text, terms text, payment_instructions text,
  issuer jsonb not null default '{}'::jsonb,
  sent_at timestamptz, paid_at timestamptz, cancelled_at timestamptz, cancelled_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, invoice_number),
  check (due_date >= issue_date),
  check (status <> 'cancelled' or char_length(btrim(coalesce(cancelled_reason, ''))) > 0),
  check (amount_paid >= 0 and amount_paid <= total)
);
create index invoices_ws_status_idx on public.invoices (workspace_id, status);
create index invoices_ws_due_idx on public.invoices (workspace_id, due_date);
create index invoices_org_idx on public.invoices (organization_id);
create index invoices_created_by_idx on public.invoices (created_by);
create trigger set_updated_at before update on public.invoices for each row execute function public.set_updated_at();

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position int not null,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_type text not null default 'percent' check (discount_type in ('percent','amount')),
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_subtotal numeric(14,2) not null default 0, line_discount numeric(14,2) not null default 0, line_tax numeric(14,2) not null default 0, line_total numeric(14,2) not null default 0,
  unique (invoice_id, position),
  check (discount_type <> 'percent' or discount_value <= 100)
);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text, reference text, notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id);

create table public.invoice_events (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null, description text not null default '', metadata jsonb not null default '{}'::jsonb,
  user_id uuid, created_at timestamptz not null default now()
);
create index invoice_events_invoice_idx on public.invoice_events (invoice_id, created_at desc);

create table public.invoice_sends (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','manual','other')),
  recipient text, note text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index invoice_sends_invoice_idx on public.invoice_sends (invoice_id);

-- ============ 4. rules ============
create or replace function public.invoices_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); internal boolean := coalesce(current_setting('app.invoice_internal', true), '') = 'on'; n_items int;
        free_keys text[] := array['status','due_date','notes','amount_paid','paid_at','sent_at','cancelled_at','cancelled_reason','updated_at','balance'];
begin
  if tg_op = 'INSERT' then
    if actor is not null and new.status <> 'draft' then raise exception 'New invoices start as drafts.' using errcode = 'P0001'; end if;
    if new.invoice_number is null or new.invoice_number = '' then new.invoice_number := public.next_invoice_number(new.workspace_id, new.issue_date); end if;
    new.issuer := public.invoice_issuer(new.workspace_id);
    return new;
  end if;
  if old.status = 'cancelled' then raise exception 'Cancelled invoices can''t be changed.' using errcode = 'P0001'; end if;
  if internal then return new; end if;                                 -- totals and payments, maintained by triggers below

  if old.status = 'draft' then
    if new.status = 'sent' then
      if actor is not null and not public.can_do('invoices', 'approve') then raise exception 'You don''t have permission to send invoices.' using errcode = 'P0001'; end if;
      select count(*) into n_items from invoice_items where invoice_id = old.id;
      if n_items = 0 then raise exception 'Add at least one item before sending.' using errcode = 'P0001'; end if;
      if new.total <= 0 then raise exception 'The invoice total must be above zero before it is sent.' using errcode = 'P0001'; end if;
      new.sent_at := coalesce(new.sent_at, now());
    elsif new.status = 'cancelled' then
      if actor is not null and not public.can_do('invoices', 'approve') then raise exception 'You don''t have permission to cancel invoices.' using errcode = 'P0001'; end if;
      new.cancelled_at := now();
    elsif new.status <> 'draft' then
      raise exception 'A draft can only be sent or cancelled.' using errcode = 'P0001';
    end if;
    new.issuer := public.invoice_issuer(new.workspace_id);              -- drafts follow the company settings; the snapshot freezes when sent
    return new;
  end if;

  -- finalized: only the due date and notes can change, plus cancelling
  if (to_jsonb(new) - free_keys) is distinct from (to_jsonb(old) - free_keys) then
    raise exception 'A sent invoice can only change its due date and notes. Cancel it and create a corrected copy instead.' using errcode = 'P0001';
  end if;
  if new.amount_paid is distinct from old.amount_paid or new.paid_at is distinct from old.paid_at or new.sent_at is distinct from old.sent_at then
    raise exception 'Payments are recorded in the payments list.' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if new.status <> 'cancelled' then raise exception 'The status follows payments and can''t be set by hand.' using errcode = 'P0001'; end if;
    if actor is not null and not public.can_do('invoices', 'approve') then raise exception 'You don''t have permission to cancel invoices.' using errcode = 'P0001'; end if;
    if old.amount_paid > 0 then raise exception 'Remove the recorded payments before cancelling.' using errcode = 'P0001'; end if;
    new.cancelled_at := now();
  end if;
  return new;
end $$;
create trigger invoices_guard before insert or update on public.invoices for each row execute function public.invoices_guard();

create or replace function public.invoice_items_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare st text; inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  select status into st from invoices where id = inv;
  if found and st <> 'draft' then raise exception 'Only draft invoices can be edited.' using errcode = 'P0001'; end if;
  if tg_op = 'DELETE' then return old; end if;
  new.line_subtotal := round(new.quantity * new.unit_price, 2);
  new.line_discount := case when new.discount_type = 'percent' then round(new.line_subtotal * new.discount_value / 100, 2) else least(new.discount_value, new.line_subtotal) end;
  new.line_tax := round((new.line_subtotal - new.line_discount) * new.tax_rate / 100, 2);
  new.line_total := new.line_subtotal - new.line_discount + new.line_tax;
  return new;
end $$;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items for each row execute function public.invoice_items_guard();

create or replace function public.invoice_items_totals() returns trigger language plpgsql security definer set search_path = public as $$
declare inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  perform set_config('app.invoice_internal', 'on', true);
  update invoices i set subtotal = t.s, discount_total = t.d, tax_total = t.x, total = t.s - t.d + t.x
    from (select coalesce(sum(line_subtotal), 0) s, coalesce(sum(line_discount), 0) d, coalesce(sum(line_tax), 0) x from invoice_items where invoice_id = inv) t
   where i.id = inv;
  perform set_config('app.invoice_internal', 'off', true);
  return null;
end $$;
create trigger invoice_items_totals after insert or update or delete on public.invoice_items for each row execute function public.invoice_items_totals();

-- payments: only on sent invoices, never more than the balance; the invoice status follows them
create or replace function public.invoice_payments_before() returns trigger language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  select status, total, amount_paid into inv from invoices where id = new.invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0001'; end if;
  if inv.status not in ('sent', 'partially_paid') then raise exception 'Payments can only be recorded on a sent invoice with a balance due.' using errcode = 'P0001'; end if;
  if new.amount > inv.total - inv.amount_paid then raise exception 'That payment is more than the balance due.' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger invoice_payments_before before insert on public.invoice_payments for each row execute function public.invoice_payments_before();

create or replace function public.invoice_payments_after() returns trigger language plpgsql security definer set search_path = public as $$
declare inv uuid := coalesce(new.invoice_id, old.invoice_id); paid numeric(14,2);
begin
  select coalesce(sum(amount), 0) into paid from invoice_payments where invoice_id = inv;
  perform set_config('app.invoice_internal', 'on', true);
  update invoices set amount_paid = paid,
      status = case when paid >= total then 'paid' when paid > 0 then 'partially_paid' else 'sent' end,
      paid_at = case when paid >= total then now() else null end
    where id = inv and status in ('sent', 'partially_paid', 'paid');
  perform set_config('app.invoice_internal', 'off', true);
  return null;
end $$;
create trigger invoice_payments_after after insert or delete on public.invoice_payments for each row execute function public.invoice_payments_after();

-- history
create or replace function public.invoice_events_invoices() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into invoice_events (invoice_id, workspace_id, event_type, description, user_id) values (new.id, new.workspace_id, 'created', 'Invoice ' || new.invoice_number || ' created as a draft', actor);
  elsif new.status is distinct from old.status then
    insert into invoice_events (invoice_id, workspace_id, event_type, description, metadata, user_id)
    values (new.id, new.workspace_id, 'status_changed',
            initcap(replace(old.status, '_', ' ')) || ' to ' || initcap(replace(new.status, '_', ' ')) || case when new.status = 'cancelled' then '. Reason: ' || new.cancelled_reason else '' end,
            jsonb_build_object('from', old.status, 'to', new.status), actor);
  end if;
  return null;
end $$;
create or replace function public.invoice_events_payments() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); ws uuid;
begin
  select workspace_id into ws from invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if ws is null then return null; end if;                              -- the invoice itself is being deleted
  if tg_op = 'INSERT' then
    insert into invoice_events (invoice_id, workspace_id, event_type, description, metadata, user_id)
    values (new.invoice_id, ws, 'payment_added', 'Payment of ' || new.amount || ' recorded' || coalesce(' (' || new.method || ')', ''), jsonb_build_object('amount', new.amount), actor);
  else
    insert into invoice_events (invoice_id, workspace_id, event_type, description, metadata, user_id)
    values (old.invoice_id, ws, 'payment_removed', 'Payment of ' || old.amount || ' removed', jsonb_build_object('amount', old.amount), actor);
  end if;
  return null;
end $$;
create or replace function public.invoice_events_sends() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into invoice_events (invoice_id, workspace_id, event_type, description, metadata, user_id)
  values (new.invoice_id, new.workspace_id, 'sent', 'Sent via ' || new.channel || coalesce(' to ' || new.recipient, ''), jsonb_build_object('channel', new.channel, 'recipient', new.recipient), auth.uid());
  return null;
end $$;
create trigger invoice_events_a after insert or update on public.invoices for each row execute function public.invoice_events_invoices();
create trigger invoice_events_b after insert or delete on public.invoice_payments for each row execute function public.invoice_events_payments();
create trigger invoice_events_c after insert on public.invoice_sends for each row execute function public.invoice_events_sends();

-- audit trail (one summary row per batch of line items, not one per line)
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
    if changed is null then return null; end if;
    if coalesce(current_setting('app.invoice_internal', true), '') = 'on' and changed <@ array['subtotal', 'discount_total', 'tax_total', 'total'] then return null; end if;
  end if;
  ws := coalesce((j->>'workspace_id')::uuid, (select workspace_id from roles where id = (j->>'role_id')::uuid), (select workspace_id from profiles where id = actor), (select id from workspaces order by created_at limit 1));
  rec := coalesce(j->>'id', j->>'role_id', j->>'workspace_id');
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

create trigger audit_row_change after insert or update or delete on public.invoices for each row execute function public.audit_row_change('invoices');
create trigger audit_row_change after insert or update or delete on public.invoice_payments for each row execute function public.audit_row_change('invoices');
create trigger audit_row_change after insert or update or delete on public.invoice_settings for each row execute function public.audit_row_change('settings');

create or replace function public.audit_invoice_items_added() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; actor uuid := auth.uid(); uname text; org jsonb := public.request_origin();
begin
  select coalesce(nullif(full_name, ''), email) into uname from profiles where id = actor;
  for r in select n.invoice_id, count(*) c, i.workspace_id, i.invoice_number from new_rows n join invoices i on i.id = n.invoice_id group by 1, 3, 4 loop
    perform audit_write(r.workspace_id, actor, coalesce(uname, 'System'), 'update', 'invoices', r.invoice_id::text, 'Added ' || r.c || ' line item(s) to invoice ' || r.invoice_number,
                        null, jsonb_build_object('lines_added', r.c), 'success', '{}'::jsonb, org->>'ip', org->>'ua', null);
  end loop;
  return null;
end $$;
create or replace function public.audit_invoice_items_removed() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; actor uuid := auth.uid(); uname text; org jsonb := public.request_origin();
begin
  select coalesce(nullif(full_name, ''), email) into uname from profiles where id = actor;
  for r in select o.invoice_id, count(*) c, i.workspace_id, i.invoice_number from old_rows o join invoices i on i.id = o.invoice_id group by 1, 3, 4 loop
    perform audit_write(r.workspace_id, actor, coalesce(uname, 'System'), 'update', 'invoices', r.invoice_id::text, 'Removed ' || r.c || ' line item(s) from invoice ' || r.invoice_number,
                        jsonb_build_object('lines_removed', r.c), null, 'success', '{}'::jsonb, org->>'ip', org->>'ua', null);
  end loop;
  return null;
end $$;
create trigger audit_items_added after insert on public.invoice_items referencing new table as new_rows for each statement execute function public.audit_invoice_items_added();
create trigger audit_items_removed after delete on public.invoice_items referencing old table as old_rows for each statement execute function public.audit_invoice_items_removed();

-- ============ 5. access ============
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.invoice_events enable row level security;
alter table public.invoice_sends enable row level security;

-- Manage: every invoice. Otherwise: invoices you created or your team created.
create policy invoices_select on public.invoices for select to authenticated using (workspace_id = (select public.current_workspace_id()) and (
  (select public.has_permission('invoices.manage')) or ((select public.has_permission('invoices.view')) and (created_by = (select auth.uid()) or public.is_team_member(created_by)))));
create policy invoices_insert on public.invoices for insert to authenticated with check (workspace_id = (select public.current_workspace_id()) and created_by = (select auth.uid()) and (select public.can_do('invoices', 'create')));
create policy invoices_update on public.invoices for update to authenticated using (workspace_id = (select public.current_workspace_id()) and (
  (select public.has_permission('invoices.manage')) or ((select public.has_permission('invoices.edit')) and (created_by = (select auth.uid()) or public.is_team_member(created_by)))))
  with check (workspace_id = (select public.current_workspace_id()));
create policy invoices_delete on public.invoices for delete to authenticated using (workspace_id = (select public.current_workspace_id()) and status = 'draft' and (
  (select public.has_permission('invoices.manage')) or ((select public.has_permission('invoices.edit')) and created_by = (select auth.uid()))));

create policy invoice_items_select on public.invoice_items for select to authenticated using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy invoice_items_write on public.invoice_items for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id) and (select public.can_do('invoices', 'edit')))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id) and (select public.can_do('invoices', 'edit')));

create policy invoice_payments_select on public.invoice_payments for select to authenticated using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy invoice_payments_insert on public.invoice_payments for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (select 1 from public.invoices i where i.id = invoice_id and i.workspace_id = workspace_id) and (select public.can_do('invoices', 'edit')));
create policy invoice_payments_delete on public.invoice_payments for delete to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id) and (select public.can_do('invoices', 'approve')));

create policy invoice_events_select on public.invoice_events for select to authenticated using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy invoice_events_insert on public.invoice_events for insert to authenticated
  with check (user_id = (select auth.uid()) and event_type in ('downloaded', 'duplicated') and exists (select 1 from public.invoices i where i.id = invoice_id and i.workspace_id = workspace_id));

create policy invoice_sends_select on public.invoice_sends for select to authenticated using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy invoice_sends_insert on public.invoice_sends for insert to authenticated
  with check (sent_by = (select auth.uid()) and (select public.can_do('invoices', 'approve')) and exists (select 1 from public.invoices i where i.id = invoice_id and i.workspace_id = workspace_id));

-- ============ 6. operations (SECURITY INVOKER: every row is still checked against the policies above) ============
create or replace function public.save_invoice(p_invoice jsonb, p_items jsonb) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid := nullif(p_invoice->>'id', '')::uuid; v_ws uuid := public.current_workspace_id(); s invoice_settings%rowtype; v_issue date; v_due date;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one line item.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'An invoice can have at most 200 line items.' using errcode = 'P0001'; end if;
  select * into s from invoice_settings where workspace_id = v_ws;
  v_issue := coalesce(nullif(p_invoice->>'issue_date', '')::date, current_date);
  v_due := coalesce(nullif(p_invoice->>'due_date', '')::date, v_issue + coalesce(s.default_due_days, 14));

  if v_id is null then
    insert into invoices (workspace_id, organization_id, contact_id, lead_id, bill_to_name, bill_to_email, bill_to_phone, bill_to_address, bill_to_tax_id,
                          issue_date, due_date, currency, notes, terms, payment_instructions, created_by)
    values (v_ws, nullif(p_invoice->>'organization_id', '')::uuid, nullif(p_invoice->>'contact_id', '')::uuid, nullif(p_invoice->>'lead_id', '')::uuid,
            btrim(p_invoice->>'bill_to_name'), nullif(btrim(p_invoice->>'bill_to_email'), ''), nullif(btrim(p_invoice->>'bill_to_phone'), ''), nullif(btrim(p_invoice->>'bill_to_address'), ''), nullif(btrim(p_invoice->>'bill_to_tax_id'), ''),
            v_issue, v_due, upper(coalesce(nullif(p_invoice->>'currency', ''), s.default_currency, 'USD')), nullif(btrim(p_invoice->>'notes'), ''),
            coalesce(nullif(btrim(p_invoice->>'terms'), ''), s.terms), coalesce(nullif(btrim(p_invoice->>'payment_instructions'), ''), s.payment_instructions), auth.uid())
    returning id into v_id;
  else
    update invoices set
        organization_id = case when p_invoice ? 'organization_id' then nullif(p_invoice->>'organization_id', '')::uuid else organization_id end,
        contact_id = case when p_invoice ? 'contact_id' then nullif(p_invoice->>'contact_id', '')::uuid else contact_id end,
        lead_id = case when p_invoice ? 'lead_id' then nullif(p_invoice->>'lead_id', '')::uuid else lead_id end,
        bill_to_name = coalesce(nullif(btrim(p_invoice->>'bill_to_name'), ''), bill_to_name),
        bill_to_email = case when p_invoice ? 'bill_to_email' then nullif(btrim(p_invoice->>'bill_to_email'), '') else bill_to_email end,
        bill_to_phone = case when p_invoice ? 'bill_to_phone' then nullif(btrim(p_invoice->>'bill_to_phone'), '') else bill_to_phone end,
        bill_to_address = case when p_invoice ? 'bill_to_address' then nullif(btrim(p_invoice->>'bill_to_address'), '') else bill_to_address end,
        bill_to_tax_id = case when p_invoice ? 'bill_to_tax_id' then nullif(btrim(p_invoice->>'bill_to_tax_id'), '') else bill_to_tax_id end,
        issue_date = case when p_invoice ? 'issue_date' then v_issue else issue_date end,
        due_date = case when p_invoice ? 'due_date' or p_invoice ? 'issue_date' then v_due else due_date end,
        currency = upper(coalesce(nullif(p_invoice->>'currency', ''), currency)),
        notes = case when p_invoice ? 'notes' then nullif(btrim(p_invoice->>'notes'), '') else notes end,
        terms = case when p_invoice ? 'terms' then nullif(btrim(p_invoice->>'terms'), '') else terms end,
        payment_instructions = case when p_invoice ? 'payment_instructions' then nullif(btrim(p_invoice->>'payment_instructions'), '') else payment_instructions end
      where id = v_id and status = 'draft';
    if not found then raise exception 'Only draft invoices that you can edit can be saved.' using errcode = 'P0001'; end if;
    delete from invoice_items where invoice_id = v_id;
  end if;

  insert into invoice_items (invoice_id, position, description, quantity, unit_price, discount_type, discount_value, tax_rate)
  select v_id, e.ord::int, btrim(e.item->>'description'), (e.item->>'quantity')::numeric, (e.item->>'unit_price')::numeric,
         coalesce(nullif(e.item->>'discount_type', ''), 'percent'), coalesce(nullif(e.item->>'discount_value', '')::numeric, 0), coalesce(nullif(e.item->>'tax_rate', '')::numeric, 0)
    from jsonb_array_elements(p_items) with ordinality as e(item, ord);
  return v_id;
end $$;

create or replace function public.duplicate_invoice(p_id uuid) returns uuid language plpgsql security invoker set search_path = public as $$
declare src invoices%rowtype; v_new uuid; s invoice_settings%rowtype;
begin
  select * into src from invoices where id = p_id;
  if not found then raise exception 'Invoice not found, or you do not have access to it.' using errcode = 'P0001'; end if;
  select * into s from invoice_settings where workspace_id = src.workspace_id;
  insert into invoices (workspace_id, organization_id, contact_id, lead_id, bill_to_name, bill_to_email, bill_to_phone, bill_to_address, bill_to_tax_id,
                        issue_date, due_date, currency, notes, terms, payment_instructions, created_by)
  values (src.workspace_id, src.organization_id, src.contact_id, src.lead_id, src.bill_to_name, src.bill_to_email, src.bill_to_phone, src.bill_to_address, src.bill_to_tax_id,
          current_date, current_date + (src.due_date - src.issue_date), src.currency, src.notes, src.terms, src.payment_instructions, auth.uid())
  returning id into v_new;
  insert into invoice_items (invoice_id, position, description, quantity, unit_price, discount_type, discount_value, tax_rate)
    select v_new, position, description, quantity, unit_price, discount_type, discount_value, tax_rate from invoice_items where invoice_id = p_id;
  insert into invoice_events (invoice_id, workspace_id, event_type, description, user_id) values (v_new, src.workspace_id, 'duplicated', 'Copied from invoice ' || src.invoice_number, auth.uid());
  return v_new;
end $$;

create or replace function public.record_invoice_send(p_id uuid, p_channel text, p_recipient text default null, p_note text default null) returns void
language plpgsql security invoker set search_path = public as $$
declare inv invoices%rowtype;
begin
  select * into inv from invoices where id = p_id;
  if not found then raise exception 'Invoice not found, or you do not have access to it.' using errcode = 'P0001'; end if;
  if inv.status = 'cancelled' then raise exception 'Cancelled invoices can''t be sent.' using errcode = 'P0001'; end if;
  if p_channel not in ('email', 'whatsapp', 'manual', 'other') then raise exception 'Unknown channel.' using errcode = 'P0001'; end if;
  if inv.status = 'draft' then update invoices set status = 'sent' where id = p_id; end if;
  insert into invoice_sends (invoice_id, workspace_id, channel, recipient, note, sent_by) values (p_id, inv.workspace_id, p_channel, nullif(btrim(p_recipient), ''), nullif(btrim(p_note), ''), auth.uid());
end $$;

create or replace function public.invoice_summary(p_today date, p_month_start date) returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'drafts', (select count(*) from invoices where status = 'draft'),
    'outstanding', (select coalesce(jsonb_object_agg(currency, v), '{}'::jsonb) from (select currency, sum(balance) v from invoices where status in ('sent', 'partially_paid') group by 1) a),
    'overdue', (select coalesce(jsonb_object_agg(currency, v), '{}'::jsonb) from (select currency, sum(balance) v from invoices where status in ('sent', 'partially_paid') and due_date < p_today group by 1) b),
    'overdue_count', (select count(*) from invoices where status in ('sent', 'partially_paid') and due_date < p_today),
    'collected_month', (select coalesce(jsonb_object_agg(currency, v), '{}'::jsonb) from (select i.currency, sum(p.amount) v from invoice_payments p join invoices i on i.id = p.invoice_id where p.paid_on >= p_month_start group by 1) c))
$$;
grant execute on function public.save_invoice(jsonb, jsonb), public.duplicate_invoice(uuid), public.record_invoice_send(uuid, text, text, text), public.invoice_summary(date, date) to authenticated;

-- ============ 7. company logo (public read; only people who manage settings can write, only in their workspace's folder) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = public.current_workspace_id()::text and public.can_do('settings', 'manage'));
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = public.current_workspace_id()::text and public.can_do('settings', 'manage'));
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = public.current_workspace_id()::text and public.can_do('settings', 'manage'));
