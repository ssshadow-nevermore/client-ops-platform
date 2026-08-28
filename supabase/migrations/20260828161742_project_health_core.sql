-- Project Health Core.
--
-- project_health is the canonical health snapshot for a project.
-- Health state must NOT be duplicated in public.projects.
--
-- This migration does not implement HTTP/SSL/provider checks yet.
-- It only establishes the secure storage model those checks will update.

-- ============================================================
-- Project health
-- ============================================================

create table public.project_health (
  project_id uuid primary key,

  organization_id uuid not null,

  overall_status text not null default 'not_configured'
    check (
      overall_status in (
        'not_configured',
        'unknown',
        'healthy',
        'degraded',
        'critical'
      )
    ),

  http_status text not null default 'not_configured'
    check (
      http_status in (
        'not_configured',
        'unknown',
        'healthy',
        'degraded',
        'critical'
      )
    ),

  ssl_status text not null default 'not_configured'
    check (
      ssl_status in (
        'not_configured',
        'unknown',
        'healthy',
        'degraded',
        'critical'
      )
    ),

  deployment_status text not null default 'not_configured'
    check (
      deployment_status in (
        'not_configured',
        'unknown',
        'healthy',
        'degraded',
        'critical'
      )
    ),

  critical_errors_status text not null default 'not_configured'
    check (
      critical_errors_status in (
        'not_configured',
        'unknown',
        'healthy',
        'degraded',
        'critical'
      )
    ),

  integration_freshness_status text not null default 'not_configured'
    check (
      integration_freshness_status in (
        'not_configured',
        'unknown',
        'healthy',
        'degraded',
        'critical'
      )
    ),

  -- HTTP signal details.
  http_status_code smallint
    check (
      http_status_code is null
      or http_status_code between 100 and 599
    ),

  http_response_time_ms integer
    check (
      http_response_time_ms is null
      or http_response_time_ms >= 0
    ),

  -- SSL signal details.
  ssl_expires_at timestamptz,

  -- Error-provider signal details.
  critical_error_count integer
    check (
      critical_error_count is null
      or critical_error_count >= 0
    ),

  -- Last time the health subsystem produced a snapshot.
  last_checked_at timestamptz,

  -- Provider/check-specific information that does not deserve
  -- a core schema column yet.
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_health_project_organization_fk
    foreign key (
      project_id,
      organization_id
    )
    references public.projects (
      id,
      organization_id
    )
    on delete restrict
);


create index project_health_organization_id_idx
  on public.project_health(organization_id);

create index project_health_overall_status_idx
  on public.project_health(overall_status);

create index project_health_last_checked_at_idx
  on public.project_health(last_checked_at desc)
  where last_checked_at is not null;


create trigger project_health_set_updated_at
before update on public.project_health
for each row
execute function public.set_updated_at();


-- ============================================================
-- Automatically create the 1:1 health row for every project.
--
-- This does NOT perform a health check.
-- A newly-created project starts as not_configured.
-- ============================================================

create or replace function private.create_project_health_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_health (
    project_id,
    organization_id
  )
  values (
    new.id,
    new.organization_id
  )
  on conflict (project_id)
  do nothing;

  return new;
end;
$$;


revoke all on function private.create_project_health_row()
from public, anon, authenticated;


create trigger projects_create_project_health
after insert on public.projects
for each row
execute function private.create_project_health_row();


-- ============================================================
-- Backfill projects that existed before Project Health Core.
-- ============================================================

insert into public.project_health (
  project_id,
  organization_id
)
select
  p.id,
  p.organization_id
from public.projects p
on conflict (project_id)
do nothing;


-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.project_health
  enable row level security;


-- ============================================================
-- SQL privileges
--
-- Browser users may only read health information.
-- Future health workers / controlled server flows will own writes.
-- ============================================================

revoke all on table public.project_health
from anon, authenticated;

grant select on table public.project_health
to authenticated;


-- ============================================================
-- RLS policies
--
-- Organization ownership alone does not imply project access.
-- Explicit ProjectMembership + health.read remains required.
-- ============================================================

create policy "project_health_select_authorized"
on public.project_health
for select
to authenticated
using (
  public.has_project_permission(
    project_id,
    'health.read'
  )
);