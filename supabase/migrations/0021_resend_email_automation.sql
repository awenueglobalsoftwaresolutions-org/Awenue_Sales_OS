-- Resend Email Automation & Mailing System: Notification logs, delivery tracking, and sender separation.

create table if not exists public.email_notification_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null check (event_type in (
    'ticket_created', 'ticket_reply', 'ticket_status_changed', 'ticket_assigned',
    'ticket_resolved', 'ticket_reopened', 'ticket_closed', 'ticket_escalated',
    'invoice_generated', 'invoice_reminder', 'payment_confirmation', 'payment_overdue', 'invoice_cancelled'
  )),
  sender_type text not null check (sender_type in ('support', 'billing')),
  sender_email text not null check (sender_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  recipient_email text not null check (recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  recipient_name text,
  subject text not null check (char_length(btrim(subject)) between 1 and 300),
  related_ticket_id uuid references public.support_tickets(id) on delete set null,
  related_invoice_id uuid references public.invoices(id) on delete set null,
  resend_email_id text,
  idempotency_key text unique,
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'delivery_delayed'
  )),
  attempt_count int not null default 0 check (attempt_count >= 0),
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_notification_logs_workspace_idx on public.email_notification_logs (workspace_id, created_at desc);
create index if not exists email_notification_logs_status_idx on public.email_notification_logs (status);
create index if not exists email_notification_logs_sender_type_idx on public.email_notification_logs (sender_type);
create index if not exists email_notification_logs_resend_id_idx on public.email_notification_logs (resend_email_id);
create index if not exists email_notification_logs_ticket_idx on public.email_notification_logs (related_ticket_id);
create index if not exists email_notification_logs_invoice_idx on public.email_notification_logs (related_invoice_id);
create index if not exists email_notification_logs_idempotency_idx on public.email_notification_logs (idempotency_key);

drop trigger if exists set_updated_at on public.email_notification_logs;
create trigger set_updated_at before update on public.email_notification_logs for each row execute function public.set_updated_at();

alter table public.email_notification_logs enable row level security;

-- Visibility: Workspace members with communications.view, reports.view, or communications.manage, or owners of the linked ticket/invoice
drop policy if exists email_notification_logs_select on public.email_notification_logs;
create policy email_notification_logs_select on public.email_notification_logs for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (
    (select public.has_permission('communications.view'))
    or (select public.has_permission('communications.manage'))
    or (select public.has_permission('reports.view'))
    or (select public.has_permission('reports.manage'))
    or (related_ticket_id is not null and exists (
      select 1 from public.support_tickets t where t.id = related_ticket_id
    ))
    or (related_invoice_id is not null and exists (
      select 1 from public.invoices i where i.id = related_invoice_id
    ))
  )
);

-- Insert: allowed for authenticated users initiating operations or service role
drop policy if exists email_notification_logs_insert on public.email_notification_logs;
create policy email_notification_logs_insert on public.email_notification_logs for insert to authenticated with check (
  workspace_id = (select public.current_workspace_id())
  and (
    (select public.has_permission('communications.manage'))
    or (select public.has_permission('invoices.manage'))
    or (select public.has_permission('invoices.approve'))
    or (select public.has_permission('tickets.create'))
    or (select public.has_permission('tickets.edit'))
  )
);

-- Update: retry or status tracking (admin / communications manager / service role)
drop policy if exists email_notification_logs_update on public.email_notification_logs;
create policy email_notification_logs_update on public.email_notification_logs for update to authenticated
  using (
    workspace_id = (select public.current_workspace_id())
    and (select public.has_permission('communications.manage'))
  )
  with check (workspace_id = (select public.current_workspace_id()));

-- Admin statistics aggregate RPC
create or replace function public.get_email_notification_stats(p_workspace_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
  v_stats jsonb;
begin
  v_ws := coalesce(p_workspace_id, public.current_workspace_id());
  if v_ws is null then
    raise exception 'Workspace ID required' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'total', coalesce(count(*), 0),
    'sent', coalesce(count(*) filter (where status in ('sent', 'delivered')), 0),
    'delivered', coalesce(count(*) filter (where status = 'delivered'), 0),
    'failed', coalesce(count(*) filter (where status = 'failed'), 0),
    'bounced', coalesce(count(*) filter (where status = 'bounced'), 0),
    'queued', coalesce(count(*) filter (where status = 'queued'), 0),
    'support_count', coalesce(count(*) filter (where sender_type = 'support'), 0),
    'billing_count', coalesce(count(*) filter (where sender_type = 'billing'), 0)
  ) into v_stats
  from public.email_notification_logs
  where workspace_id = v_ws;

  return v_stats;
end;
$$;

grant execute on function public.get_email_notification_stats(uuid) to authenticated;

-- Reload Supabase PostgREST schema cache
notify pgrst, 'reload schema';
