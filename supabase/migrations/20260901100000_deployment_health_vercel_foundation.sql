-- Generic provider connection foundation for server-side integrations.
--
-- credential_ref is only an opaque reference to a future secure credential
-- store. It is deliberately not a provider token and is never granted to
-- browser roles.

-- ============================================================
-- Provider connections
-- ============================================================

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  provider text not null,
  external_account_id text,
  credential_ref text,

  status text not null default 'unknown'
    check (status in ('connected', 'degraded', 'disconnected', 'error', 'unknown')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint provider_connections_provider_not_empty
    check (length(trim(provider)) > 0 and provider = lower(trim(provider))),

  constraint provider_connections_external_account_not_empty
    check (
      external_account_id is null
      or length(trim(external_account_id)) > 0
    ),

  constraint provider_connections_credential_ref_not_empty
    check (
      credential_ref is null
      or length(trim(credential_ref)) > 0
    ),

  constraint provider_connections_id_organization_unique
    unique (id, organization_id),

  constraint provider_connections_id_provider_unique
    unique (id, provider),

  constraint provider_connections_unique_external_account
    unique (organization_id, provider, external_account_id)
);

create index provider_connections_organization_provider_idx
  on public.provider_connections(organization_id, provider);

create index provider_connections_status_idx
  on public.provider_connections(status);

create trigger provider_connections_set_updated_at
before update on public.provider_connections
for each row
execute function public.set_updated_at();


-- ============================================================
-- Project/provider links
-- ============================================================

create table public.project_provider_links (
  project_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider text not null,

  external_project_id text not null,
  external_project_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_provider_links_pk
    primary key (project_id, provider),

  constraint project_provider_links_provider_not_empty
    check (length(trim(provider)) > 0 and provider = lower(trim(provider))),

  constraint project_provider_links_external_project_id_not_empty
    check (length(trim(external_project_id)) > 0),

  constraint project_provider_links_external_project_name_not_empty
    check (
      external_project_name is null
      or length(trim(external_project_name)) > 0
    ),

  constraint project_provider_links_project_tenant_fk
    foreign key (project_id, organization_id)
    references public.projects(id, organization_id)
    on delete restrict,

  constraint project_provider_links_connection_tenant_fk
    foreign key (connection_id, organization_id)
    references public.provider_connections(id, organization_id)
    on delete restrict,

  constraint project_provider_links_connection_provider_fk
    foreign key (connection_id, provider)
    references public.provider_connections(id, provider)
    on delete restrict,

  constraint project_provider_links_unique_external_project
    unique (connection_id, external_project_id)
);

create index project_provider_links_organization_project_idx
  on public.project_provider_links(organization_id, project_id);

create index project_provider_links_connection_id_idx
  on public.project_provider_links(connection_id);

create trigger project_provider_links_set_updated_at
before update on public.project_provider_links
for each row
execute function public.set_updated_at();


-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.provider_connections
  enable row level security;

alter table public.project_provider_links
  enable row level security;


-- ============================================================
-- SQL privileges
-- ============================================================

revoke all
on table public.provider_connections
from anon, authenticated, service_role;

revoke all
on table public.project_provider_links
from anon, authenticated, service_role;

-- Provider connection metadata is readable only through safe columns.
-- credential_ref remains server-only even for authorized developers.
grant select (
  id,
  organization_id,
  provider,
  external_account_id,
  status,
  created_at,
  updated_at
)
on table public.provider_connections
to authenticated;

grant select
on table public.project_provider_links
to authenticated;

grant select
on table public.provider_connections
to service_role;

grant select
on table public.project_provider_links
to service_role;


-- ============================================================
-- RLS policies
-- ============================================================

-- A connection is visible only when the caller has integrations.read on at
-- least one explicitly linked project. Organization membership alone is not
-- enough, and an OWNER without ProjectMembership does not gain project access.
create policy "provider_connections_select_project_authorized"
on public.provider_connections
for select
to authenticated
using (
  exists (
    select 1
    from public.project_provider_links ppl
    where ppl.connection_id = provider_connections.id
      and public.has_project_permission(
        ppl.project_id,
        'integrations.read'
      )
  )
);

create policy "project_provider_links_select_project_authorized"
on public.project_provider_links
for select
to authenticated
using (
  public.has_project_permission(
    project_id,
    'integrations.read'
  )
);


-- No browser INSERT/UPDATE/DELETE policies are created. Connection/link
-- mutations remain a future controlled server-side flow.
