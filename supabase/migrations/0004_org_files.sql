-- Organization file manager: folders and files metadata. File bytes live in Cloudflare R2.

create table public.org_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.org_items(id) on delete cascade,   -- null = top level of the organization
  kind text not null check (kind in ('folder','file')),
  name text not null check (char_length(btrim(name)) between 1 and 200 and name !~ '[/\\]'),
  storage_key text unique,                                            -- R2 object key (files only)
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'file' and storage_key is not null) or (kind = 'folder' and storage_key is null))
);
-- No two items with the same name in the same folder (case-insensitive).
create unique index org_items_name_uq on public.org_items
  (organization_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index org_items_parent_idx on public.org_items(organization_id, parent_id);

create trigger set_updated_at before update on public.org_items for each row execute function public.set_updated_at();

-- A parent must be a folder in the same organization.
create or replace function public.org_items_validate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.org_items p where p.id = new.parent_id and p.kind = 'folder' and p.organization_id = new.organization_id
  ) then
    raise exception 'The parent must be a folder in the same organization.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger org_items_validate before insert or update of parent_id, organization_id on public.org_items
  for each row execute function public.org_items_validate();

-- RLS: workspace members read, add and rename; only the creator or a manager/admin can delete.
alter table public.org_items enable row level security;
create policy org_items_select on public.org_items for select to authenticated using (workspace_id = public.current_workspace_id());
create policy org_items_insert on public.org_items for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and created_by = auth.uid());
create policy org_items_update on public.org_items for update to authenticated
  using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
create policy org_items_delete on public.org_items for delete to authenticated
  using (workspace_id = public.current_workspace_id() and (created_by = auth.uid() or public.is_manager_or_admin()));

-- All R2 keys under an item (the item itself if it is a file, or every file in a folder tree). RLS applies.
create or replace function public.org_item_file_keys(p_item_id uuid) returns text[]
language sql stable security invoker set search_path = public as $$
  with recursive tree as (
    select id, kind, storage_key from public.org_items where id = p_item_id
    union all
    select i.id, i.kind, i.storage_key from public.org_items i join tree t on i.parent_id = t.id
  )
  select coalesce(array_agg(storage_key) filter (where kind = 'file' and storage_key is not null), '{}') from tree
$$;
grant execute on function public.org_item_file_keys(uuid) to authenticated;

-- Organizations that still hold files or folders can't be deleted (it would orphan R2 objects).
create or replace function public.prevent_org_delete_with_links() returns trigger
language plpgsql security definer set search_path = public as $$
declare c int; l int; d int; f int;
begin
  select count(*) into c from public.contacts  where organization_id = old.id;
  select count(*) into l from public.leads     where organization_id = old.id;
  select count(*) into d from public.deals     where organization_id = old.id;
  select count(*) into f from public.org_items where organization_id = old.id;
  if c + l + d + f > 0 then
    raise exception 'This organization still has % contact(s), % lead(s), % deal(s) and % file/folder(s). Remove or reassign them first.', c, l, d, f
      using errcode = 'P0001';
  end if;
  return old;
end $$;
