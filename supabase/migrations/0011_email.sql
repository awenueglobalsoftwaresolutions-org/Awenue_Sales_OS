-- Email: each person connects their own Gmail account; templates; every email is stored against the CRM records it concerns.

alter table public.profiles add column email_signature text check (email_signature is null or char_length(email_signature) <= 2000);

-- ============ 1. Gmail accounts (one per person). The refresh token is encrypted by the Worker and is never readable from the browser.
create table public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  refresh_token_enc text not null,
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create trigger set_updated_at before update on public.gmail_accounts for each row execute function public.set_updated_at();
alter table public.gmail_accounts enable row level security;
revoke all on public.gmail_accounts from anon, authenticated;
grant select (id, workspace_id, user_id, email, status, last_error, connected_at, updated_at) on public.gmail_accounts to authenticated;
create policy gmail_accounts_select on public.gmail_accounts for select to authenticated using (user_id = (select auth.uid()));
-- No insert, update or delete policy: only the Worker (service role) writes here, after checking the person's identity.

-- ============ 2. templates
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  subject text not null check (char_length(btrim(subject)) between 1 and 300),
  body text not null check (char_length(body) between 1 and 20000),
  shared boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.email_templates for each row execute function public.set_updated_at();
alter table public.email_templates enable row level security;
create policy email_templates_select on public.email_templates for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (shared or created_by = (select auth.uid()) or (select public.has_permission('communications.manage'))));
create policy email_templates_insert on public.email_templates for insert to authenticated with check (
  workspace_id = (select public.current_workspace_id()) and created_by = (select auth.uid()) and (select public.can_do('communications', 'create')));
create policy email_templates_update on public.email_templates for update to authenticated
  using (workspace_id = (select public.current_workspace_id()) and ((created_by = (select auth.uid()) and (select public.can_do('communications', 'create'))) or (select public.has_permission('communications.manage'))))
  with check (workspace_id = (select public.current_workspace_id()));
create policy email_templates_delete on public.email_templates for delete to authenticated
  using (workspace_id = (select public.current_workspace_id()) and ((created_by = (select auth.uid()) and (select public.can_do('communications', 'create'))) or (select public.has_permission('communications.manage'))));

-- ============ 3. record visibility: an email is visible to whoever can see the record it is attached to
create or replace function public.email_record_visible(p_contact uuid, p_lead uuid, p_org uuid, p_deal uuid, p_invoice uuid, p_task uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select coalesce(
       (p_contact is not null and exists (select 1 from contacts where id = p_contact))
    or (p_lead    is not null and exists (select 1 from leads where id = p_lead))
    or (p_org     is not null and exists (select 1 from organizations where id = p_org))
    or (p_deal    is not null and exists (select 1 from deals where id = p_deal))
    or (p_invoice is not null and exists (select 1 from invoices where id = p_invoice))
    or (p_task    is not null and exists (select 1 from tasks where id = p_task)), false)
$$;
grant execute on function public.email_record_visible(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;

-- ============ 4. sent-email records
create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_email text not null,
  to_addresses text[] not null check (cardinality(to_addresses) between 1 and 50),
  cc_addresses text[] not null default '{}' check (cardinality(cc_addresses) <= 50),
  bcc_addresses text[] not null default '{}' check (cardinality(bcc_addresses) <= 50),
  subject text not null check (char_length(subject) between 1 and 300),
  body_text text not null default '' check (char_length(body_text) <= 100000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  gmail_message_id text,
  gmail_thread_id text,
  template_id uuid references public.email_templates(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_messages_contact_idx on public.email_messages (contact_id, created_at desc);
create index email_messages_lead_idx on public.email_messages (lead_id, created_at desc);
create index email_messages_org_idx on public.email_messages (organization_id, created_at desc);
create index email_messages_deal_idx on public.email_messages (deal_id, created_at desc);
create index email_messages_invoice_idx on public.email_messages (invoice_id, created_at desc);
create index email_messages_task_idx on public.email_messages (task_id, created_at desc);
create index email_messages_sender_idx on public.email_messages (sender_id, created_at desc);

alter table public.email_messages enable row level security;
-- Visible to the sender, to anyone with communications.manage, and to anyone who can see the record the email is attached to.
create policy email_messages_select on public.email_messages for select to authenticated using (
  workspace_id = (select public.current_workspace_id()) and (
    sender_id = (select auth.uid())
    or (select public.has_permission('communications.manage'))
    or public.email_record_visible(contact_id, lead_id, organization_id, deal_id, invoice_id, task_id)));
-- Only the signed-in sender, only with permission, and only against records they can see (or with no record at all).
create policy email_messages_insert on public.email_messages for insert to authenticated with check (
  workspace_id = (select public.current_workspace_id())
  and sender_id = (select auth.uid())
  and (select public.can_do('communications', 'create'))
  and (
    public.email_record_visible(contact_id, lead_id, organization_id, deal_id, invoice_id, task_id)
    or (contact_id is null and lead_id is null and organization_id is null and deal_id is null and invoice_id is null and task_id is null)));
-- The sender may move a message from queued to sent or failed. Sent messages are final.
create policy email_messages_update on public.email_messages for update to authenticated
  using (sender_id = (select auth.uid()) and status in ('queued', 'failed'))
  with check (sender_id = (select auth.uid()) and workspace_id = (select public.current_workspace_id()));
-- No delete policy: sent email history can't be removed through the app.

-- When an email is sent, it appears in the timeline of every record it is linked to, and on invoice history.
create or replace function public.email_after_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    if new.contact_id is not null or new.lead_id is not null or new.organization_id is not null or new.deal_id is not null then
      insert into activities (workspace_id, activity_type, title, description, lead_id, contact_id, organization_id, deal_id, user_id)
      values (new.workspace_id, 'email', 'Email sent: ' || left(new.subject, 200),
              'To: ' || array_to_string(new.to_addresses, ', ')
                || coalesce(' · Cc: ' || nullif(array_to_string(new.cc_addresses, ', '), ''), '')
                || ' · from ' || new.sender_email,
              new.lead_id, new.contact_id, new.organization_id, new.deal_id, new.sender_id);
    end if;
    if new.invoice_id is not null then
      insert into invoice_events (invoice_id, workspace_id, event_type, description, metadata, user_id)
      values (new.invoice_id, new.workspace_id, 'emailed', 'Emailed to ' || array_to_string(new.to_addresses, ', '),
              jsonb_build_object('message_id', new.id), new.sender_id);
    end if;
  end if;
  return new;
end $$;
create trigger email_after_change after insert or update of status on public.email_messages
  for each row execute function public.email_after_change();

-- Rate limit input: how many emails this person has sent in the last hour.
create or replace function public.email_sent_last_hour() returns int language sql stable security invoker set search_path = public as $$
  select count(*)::int from email_messages where sender_id = auth.uid() and status <> 'failed' and created_at > now() - interval '1 hour'
$$;
grant execute on function public.email_sent_last_hour() to authenticated;
