-- AWENUE SALES OS — Website Enquiries & Contact Messages
-- Scoped to the workspace, stores raw and structured data from the main website.

create table if not exists public.website_enquiries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_id text not null,
  enquiry_number text,
  full_name text not null,
  email text,
  phone text,
  country_code text,
  company_name text,
  website_url text,
  project_scope text,
  selected_services text[],
  selected_sub_services text[],
  budget_range text,
  timeline text,
  reference_url text,
  status text not null default 'NEW',
  assigned_to text,
  internal_notes text,
  lead_id uuid references public.leads(id) on delete set null,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_enquiries_workspace_external_uq unique (workspace_id, external_id)
);

create table if not exists public.website_contact_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_id text not null,
  message_number text,
  full_name text not null,
  email text,
  phone text,
  country_code text,
  subject text,
  message text,
  status text not null default 'NEW',
  assigned_to text,
  internal_notes text,
  lead_id uuid references public.leads(id) on delete set null,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_contact_messages_workspace_external_uq unique (workspace_id, external_id)
);

-- Indexes
create index if not exists website_enquiries_ws_idx on public.website_enquiries(workspace_id);
create index if not exists website_enquiries_email_idx on public.website_enquiries(workspace_id, lower(email));
create index if not exists website_enquiries_status_idx on public.website_enquiries(workspace_id, status);

create index if not exists website_contacts_ws_idx on public.website_contact_messages(workspace_id);
create index if not exists website_contacts_email_idx on public.website_contact_messages(workspace_id, lower(email));
create index if not exists website_contacts_status_idx on public.website_contact_messages(workspace_id, status);

-- Row Level Security
alter table public.website_enquiries enable row level security;
alter table public.website_contact_messages enable row level security;

-- Policies for website_enquiries
create policy website_enquiries_select on public.website_enquiries
  for select to authenticated using (workspace_id = public.current_workspace_id());

create policy website_enquiries_insert on public.website_enquiries
  for insert to authenticated with check (workspace_id = public.current_workspace_id());

create policy website_enquiries_update on public.website_enquiries
  for update to authenticated using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

create policy website_enquiries_delete on public.website_enquiries
  for delete to authenticated using (workspace_id = public.current_workspace_id() and public.is_manager_or_admin());

-- Policies for website_contact_messages
create policy website_contacts_select on public.website_contact_messages
  for select to authenticated using (workspace_id = public.current_workspace_id());

create policy website_contacts_insert on public.website_contact_messages
  for insert to authenticated with check (workspace_id = public.current_workspace_id());

create policy website_contacts_update on public.website_contact_messages
  for update to authenticated using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

create policy website_contacts_delete on public.website_contact_messages
  for delete to authenticated using (workspace_id = public.current_workspace_id() and public.is_manager_or_admin());
