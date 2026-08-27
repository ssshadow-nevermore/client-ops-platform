-- Audit Core
--
-- Audit events are append-only.
-- Browser clients may only read events explicitly allowed by RLS.
-- Inserts are performed only by controlled server/database flows.

-- ============================================================
-- Private schema for internal database helpers
-- ============================================================

create schema if not exists private;

revoke all on schema private
  from public, anon, authenticated;


-- ============================================================
-- Audit events
-- ============================================================

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  project_id uuid,

  -- Intentionally not a foreign key to auth.users.
  -- Audit history should preserve the actor identifier even if
  -- the authentication account is removed in the future.
  user_id uuid,

  action text not null,

  entity_type text not null,
  entity_id text,

  result text not null
    check (result in ('success', 'failed', 'denied')),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint audit_events_action_not_empty
    check (length(trim(action)) > 0),

  constraint audit_events_entity_type_not_empty
    check (length(trim(entity_type)) > 0),

  constraint audit_events_metadata_is_object
    check (jsonb_typeof(metadata) = 'object'),

  constraint audit_events_project_tenant_fk
    foreign key (project_id, organization_id)
    references public.projects(id, organization_id)
    on delete restrict
);


-- ============================================================
-- Indexes
-- ============================================================

create index audit_events_organization_created_at_idx
  on public.audit_events(organization_id, created_at desc);

create index audit_events_project_created_at_idx
  on public.audit_events(project_id, created_at desc)
  where project_id is not null;

create index audit_events_user_created_at_idx
  on public.audit_events(user_id, created_at desc)
  where user_id is not null;

create index audit_events_action_created_at_idx
  on public.audit_events(action, created_at desc);


-- ============================================================
-- Append-only protection
-- ============================================================

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;


create trigger audit_events_prevent_update
before update on public.audit_events
for each row
execute function private.prevent_audit_mutation();


create trigger audit_events_prevent_delete
before delete on public.audit_events
for each row
execute function private.prevent_audit_mutation();


-- ============================================================
-- Internal audit writer
--
-- Not executable by browser roles.
-- Future controlled SECURITY DEFINER flows can call this helper.
-- ============================================================

create or replace function private.write_audit_event(
  target_organization_id uuid,
  target_project_id uuid,
  target_user_id uuid,
  target_action text,
  target_entity_type text,
  target_entity_id text,
  target_result text,
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_audit_id uuid;
begin
  insert into public.audit_events (
    organization_id,
    project_id,
    user_id,
    action,
    entity_type,
    entity_id,
    result,
    metadata
  )
  values (
    target_organization_id,
    target_project_id,
    target_user_id,
    target_action,
    target_entity_type,
    target_entity_id,
    target_result,
    coalesce(target_metadata, '{}'::jsonb)
  )
  returning id into new_audit_id;

  return new_audit_id;
end;
$$;


revoke all on function private.write_audit_event(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
)
from public, anon, authenticated;


revoke all on function private.prevent_audit_mutation()
from public, anon, authenticated;


-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.audit_events
  enable row level security;


-- ============================================================
-- SQL privileges
-- ============================================================

revoke all
  on table public.audit_events
  from anon, authenticated;

grant select
  on table public.audit_events
  to authenticated;


-- ============================================================
-- RLS policies
-- ============================================================

create policy "audit_events_select_authorized"
on public.audit_events
for select
to authenticated
using (
  (
    project_id is not null
    and public.has_project_permission(
      project_id,
      'audit.read'
    )
  )
  or
  (
    project_id is null
    and public.is_organization_owner(
      organization_id
    )
  )
);