-- Invoices connected to the rest of the CRM: service prices, deal link, signature, smart suggestions.

-- Services can carry a default price and tax rate that invoices pick up.
alter table public.services
  add column default_price numeric(14,2) check (default_price is null or default_price >= 0),
  add column default_tax_rate numeric(5,2) check (default_tax_rate is null or default_tax_rate between 0 and 100);

-- Authorised signature printed on invoices (stored in the same public "branding" bucket as the logo).
alter table public.invoice_settings add column signature_url text;
create or replace function public.invoice_issuer(p_ws uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('company_name', company_name, 'address', address, 'email', email, 'phone', phone, 'website', website,
                                             'tax_id', tax_id, 'logo_url', logo_url, 'signature_url', signature_url)
                     from invoice_settings where workspace_id = p_ws), '{}'::jsonb)
$$;
revoke all on function public.invoice_issuer(uuid) from public, anon, authenticated;

-- An invoice can belong to a deal (and therefore shows up on the deal, its organization and its contact).
alter table public.invoices add column deal_id uuid references public.deals(id) on delete set null;
create index invoices_deal_idx on public.invoices (deal_id);
create index invoices_contact_idx on public.invoices (contact_id);
create index invoices_lead_idx on public.invoices (lead_id);

create or replace function public.save_invoice(p_invoice jsonb, p_items jsonb) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid := nullif(p_invoice->>'id', '')::uuid; v_ws uuid := public.current_workspace_id(); s invoice_settings%rowtype; v_issue date; v_due date;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one line item.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'An invoice can have at most 200 line items.' using errcode = 'P0001'; end if;
  select * into s from invoice_settings where workspace_id = v_ws;
  v_issue := coalesce(nullif(p_invoice->>'issue_date', '')::date, current_date);
  v_due := coalesce(nullif(p_invoice->>'due_date', '')::date, v_issue + coalesce(s.default_due_days, 14));

  if v_id is null then
    insert into invoices (workspace_id, organization_id, contact_id, lead_id, deal_id, bill_to_name, bill_to_email, bill_to_phone, bill_to_address, bill_to_tax_id,
                          issue_date, due_date, currency, notes, terms, payment_instructions, created_by)
    values (v_ws, nullif(p_invoice->>'organization_id', '')::uuid, nullif(p_invoice->>'contact_id', '')::uuid, nullif(p_invoice->>'lead_id', '')::uuid, nullif(p_invoice->>'deal_id', '')::uuid,
            btrim(p_invoice->>'bill_to_name'), nullif(btrim(p_invoice->>'bill_to_email'), ''), nullif(btrim(p_invoice->>'bill_to_phone'), ''), nullif(btrim(p_invoice->>'bill_to_address'), ''), nullif(btrim(p_invoice->>'bill_to_tax_id'), ''),
            v_issue, v_due, upper(coalesce(nullif(p_invoice->>'currency', ''), s.default_currency, 'USD')), nullif(btrim(p_invoice->>'notes'), ''),
            coalesce(nullif(btrim(p_invoice->>'terms'), ''), s.terms), coalesce(nullif(btrim(p_invoice->>'payment_instructions'), ''), s.payment_instructions), auth.uid())
    returning id into v_id;
  else
    update invoices set
        organization_id = case when p_invoice ? 'organization_id' then nullif(p_invoice->>'organization_id', '')::uuid else organization_id end,
        contact_id = case when p_invoice ? 'contact_id' then nullif(p_invoice->>'contact_id', '')::uuid else contact_id end,
        lead_id = case when p_invoice ? 'lead_id' then nullif(p_invoice->>'lead_id', '')::uuid else lead_id end,
        deal_id = case when p_invoice ? 'deal_id' then nullif(p_invoice->>'deal_id', '')::uuid else deal_id end,
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
declare src invoices%rowtype; v_new uuid;
begin
  select * into src from invoices where id = p_id;
  if not found then raise exception 'Invoice not found, or you do not have access to it.' using errcode = 'P0001'; end if;
  insert into invoices (workspace_id, organization_id, contact_id, lead_id, deal_id, bill_to_name, bill_to_email, bill_to_phone, bill_to_address, bill_to_tax_id,
                        issue_date, due_date, currency, notes, terms, payment_instructions, created_by)
  values (src.workspace_id, src.organization_id, src.contact_id, src.lead_id, src.deal_id, src.bill_to_name, src.bill_to_email, src.bill_to_phone, src.bill_to_address, src.bill_to_tax_id,
          current_date, current_date + (src.due_date - src.issue_date), src.currency, src.notes, src.terms, src.payment_instructions, auth.uid())
  returning id into v_new;
  insert into invoice_items (invoice_id, position, description, quantity, unit_price, discount_type, discount_value, tax_rate)
    select v_new, position, description, quantity, unit_price, discount_type, discount_value, tax_rate from invoice_items where invoice_id = p_id;
  insert into invoice_events (invoice_id, workspace_id, event_type, description, user_id) values (v_new, src.workspace_id, 'duplicated', 'Copied from invoice ' || src.invoice_number, auth.uid());
  return v_new;
end $$;

-- Type-ahead for line items: what you (or your team) invoiced before, with the latest price. Respects row level security.
create or replace function public.suggest_invoice_lines(p_q text) returns table (description text, unit_price numeric, tax_rate numeric, discount_type text, discount_value numeric)
language sql stable security invoker set search_path = public as $$
  select distinct on (lower(i.description)) i.description, i.unit_price, i.tax_rate, i.discount_type, i.discount_value
    from invoice_items i join invoices v on v.id = i.invoice_id
   where length(btrim(coalesce(p_q, ''))) >= 2 and i.description ilike '%' || btrim(p_q) || '%'
   order by lower(i.description), v.created_at desc
   limit 8
$$;
grant execute on function public.suggest_invoice_lines(text) to authenticated;

-- Totals billed / paid / outstanding for one record (organization, contact, lead or deal), per currency.
create or replace function public.record_invoice_totals(p_column text, p_id uuid) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare res jsonb;
begin
  if p_column not in ('organization_id', 'contact_id', 'lead_id', 'deal_id') then raise exception 'Unknown record type.' using errcode = 'P0001'; end if;
  execute format($q$
    select coalesce(jsonb_object_agg(currency, jsonb_build_object('billed', billed, 'paid', paid, 'outstanding', outstanding)), '{}'::jsonb)
      from (select currency, sum(total) filter (where status <> 'draft' and status <> 'cancelled') billed,
                   sum(amount_paid) filter (where status <> 'draft' and status <> 'cancelled') paid,
                   sum(balance) filter (where status in ('sent', 'partially_paid')) outstanding
              from invoices where %I = $1 group by currency) t$q$, p_column) using p_id into res;
  return res;
end $$;
grant execute on function public.record_invoice_totals(text, uuid) to authenticated;
