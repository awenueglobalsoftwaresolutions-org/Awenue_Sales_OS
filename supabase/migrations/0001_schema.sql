-- AWENUE SALES OS v1.0 — Phase 1 schema
-- Tenancy: every business table carries workspace_id. One workspace today, more later.
create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- workspaces (tenant root; added to the 8 spec tables for org-based ownership) ----------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  full_name text,
  email text not null,
  phone text,
  avatar_url text,
  role text not null default 'sales_executive' check (role in ('admin','sales_manager','sales_executive')),
  manager_id uuid references public.profiles(id) on delete set null,  -- team support for Sales Managers (future)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_workspace_idx on public.profiles(workspace_id);

-- ---------- services (configurable list) ----------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

-- ---------- organizations ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  website text, industry text, company_size text,
  country text, state text, city text, address text,
  linkedin_url text, description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organizations_name_uq on public.organizations(workspace_id, lower(name));
create index organizations_workspace_idx on public.organizations(workspace_id);

-- ---------- contacts ----------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  first_name text not null, last_name text,
  designation text, email text, phone text, linkedin_url text, country text, notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create unique index contacts_email_uq on public.contacts(workspace_id, lower(email)) where email is not null;
create index contacts_org_idx on public.contacts(organization_id);
create index contacts_workspace_idx on public.contacts(workspace_id);

-- ---------- leads ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_number bigint generated always as identity,   -- human-friendly Lead ID
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  first_name text not null, last_name text,
  job_title text, email text, phone text, website text, industry text,
  country text, state text, city text,
  source text check (source in ('linkedin','cold_email','website','google_maps','referral','advertisement','other')),
  interested_service text,
  status text not null default 'new' check (status in ('new','contacted','qualified','unqualified','converted','lost')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  assigned_to uuid references public.profiles(id) on delete set null,
  estimated_budget numeric(14,2) check (estimated_budget is null or estimated_budget >= 0),
  notes text,
  converted_contact_id uuid references public.contacts(id) on delete set null,
  converted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create unique index leads_email_uq on public.leads(workspace_id, lower(email)) where email is not null;
create index leads_workspace_status_idx on public.leads(workspace_id, status);
create index leads_assigned_idx on public.leads(assigned_to);
create index leads_org_idx on public.leads(organization_id);

-- ---------- deals ----------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  deal_number bigint generated always as identity,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,   -- primary contact
  lead_id uuid unique references public.leads(id) on delete set null,  -- unique: a lead converts to at most one deal
  interested_service text,
  value numeric(14,2) not null default 0 check (value >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  expected_close_date date,
  stage text not null default 'new_lead' check (stage in ('new_lead','contacted','interested','meeting_scheduled','proposal_sent','negotiation','won','lost')),
  assigned_to uuid references public.profiles(id) on delete set null,
  probability int not null default 10 check (probability between 0 and 100),
  description text, notes text, lost_reason text,
  won_at timestamptz, lost_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stage <> 'lost' or lost_reason is not null)
);
create index deals_workspace_stage_idx on public.deals(workspace_id, stage);
create index deals_assigned_idx on public.deals(assigned_to);
create index deals_org_idx on public.deals(organization_id);
create index deals_contact_idx on public.deals(contact_id);

alter table public.leads add column converted_deal_id uuid references public.deals(id) on delete set null;

-- ---------- tasks ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, description text,
  lead_id uuid references public.leads(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  task_type text not null default 'general' check (task_type in ('email','phone_call','meeting','follow_up','general')),
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date, due_time time,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_workspace_status_due_idx on public.tasks(workspace_id, status, due_date);
create index tasks_assigned_idx on public.tasks(assigned_to);
create index tasks_deal_idx on public.tasks(deal_id);
create index tasks_lead_idx on public.tasks(lead_id);

-- ---------- activities ----------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  activity_type text not null check (activity_type in ('email','call','meeting','note','status_update','task_completion')),
  title text not null, description text,
  lead_id uuid references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (lead_id is not null or contact_id is not null or organization_id is not null or deal_id is not null)
);
create index activities_workspace_created_idx on public.activities(workspace_id, created_at desc);
create index activities_lead_idx on public.activities(lead_id);
create index activities_contact_idx on public.activities(contact_id);
create index activities_org_idx on public.activities(organization_id);
create index activities_deal_idx on public.activities(deal_id);

-- ---------- updated_at triggers ----------
do $$ declare t text; begin
  foreach t in array array['workspaces','profiles','services','organizations','contacts','leads','deals','tasks'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- new-user bootstrap ----------
-- First user ever creates the workspace and becomes Admin. Everyone after joins it as Sales Executive;
-- an Admin can change their role in Settings (Phase 2).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid; new_role text;
begin
  select id into ws from public.workspaces order by created_at limit 1;
  if ws is null then
    insert into public.workspaces (name) values ('Awenue Global Software Solutions') returning id into ws;
    insert into public.services (workspace_id, name, sort_order)
    select ws, s.name, s.ord from (values
      ('Web Development',1),('SaaS Development',2),('Mobile App Development',3),('AI & Automation',4),
      ('Digital Marketing',5),('Graphic Design & Branding',6),('IT Consultancy',7),('Other',8)) as s(name, ord);
    new_role := 'admin';
  else
    new_role := 'sales_executive';
  end if;
  insert into public.profiles (id, workspace_id, email, full_name, role)
  values (new.id, ws, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new_role);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
