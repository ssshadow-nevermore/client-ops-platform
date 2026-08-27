-- Initial multi-tenant foundation.
-- Authorization policies are intentionally added in later migrations.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- Profiles
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  display_name text,
  avatar_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


-- ============================================================
-- Organizations
-- ============================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  slug text not null unique,

  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_name_not_empty
    check (length(trim(name)) > 0),

  constraint organizations_slug_not_empty
    check (length(trim(slug)) > 0)
);

create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();


-- ============================================================
-- Organization memberships
-- ============================================================

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  user_id uuid not null
    references auth.users(id)
    on delete restrict,

  role text not null
    check (role in ('OWNER', 'MEMBER')),

  status text not null default 'active'
    check (status in ('active', 'invited', 'disabled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organization_memberships_unique_user
    unique (organization_id, user_id)
);

create index organization_memberships_user_id_idx
  on public.organization_memberships(user_id);

create index organization_memberships_organization_status_idx
  on public.organization_memberships(organization_id, status);

create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row
execute function public.set_updated_at();


-- ============================================================
-- Projects
-- ============================================================

create table public.projects (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  name text not null,
  slug text not null,

  production_url text not null,

  status text not null default 'active'
    check (status in ('active', 'maintenance', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint projects_name_not_empty
    check (length(trim(name)) > 0),

  constraint projects_slug_not_empty
    check (length(trim(slug)) > 0),

  constraint projects_unique_slug_per_organization
    unique (organization_id, slug)
);

create index projects_organization_id_idx
  on public.projects(organization_id);

create index projects_organization_status_idx
  on public.projects(organization_id, status);

create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();


-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles
  enable row level security;

alter table public.organizations
  enable row level security;

alter table public.organization_memberships
  enable row level security;

alter table public.projects
  enable row level security;


-- ============================================================
-- Deny API access by default
-- Explicit grants and RLS policies will be added separately.
-- ============================================================

revoke all on table public.profiles
  from anon, authenticated;

revoke all on table public.organizations
  from anon, authenticated;

revoke all on table public.organization_memberships
  from anon, authenticated;

revoke all on table public.projects
  from anon, authenticated;