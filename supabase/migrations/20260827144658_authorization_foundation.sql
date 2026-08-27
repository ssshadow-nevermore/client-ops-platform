-- Authorization foundation.
-- Defines project roles, permissions and project-level memberships.
-- RLS policies are intentionally added in a separate migration.

-- ============================================================
-- Strengthen project tenant identity
-- ============================================================

alter table public.projects
  add constraint projects_id_organization_unique
  unique (id, organization_id);


-- ============================================================
-- Roles
-- ============================================================

create table public.roles (
  id uuid primary key default gen_random_uuid(),

  key text not null unique,
  name text not null,
  description text,

  is_system boolean not null default false,

  created_at timestamptz not null default now(),

  constraint roles_key_not_empty
    check (length(trim(key)) > 0),

  constraint roles_name_not_empty
    check (length(trim(name)) > 0)
);


-- ============================================================
-- Permissions
-- ============================================================

create table public.permissions (
  id uuid primary key default gen_random_uuid(),

  key text not null unique,
  description text,

  created_at timestamptz not null default now(),

  constraint permissions_key_not_empty
    check (length(trim(key)) > 0)
);


-- ============================================================
-- Role permissions
-- ============================================================

create table public.role_permissions (
  role_id uuid not null
    references public.roles(id)
    on delete restrict,

  permission_id uuid not null
    references public.permissions(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_idx
  on public.role_permissions(permission_id);


-- ============================================================
-- Project memberships
-- ============================================================

create table public.project_memberships (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,
  project_id uuid not null,

  user_id uuid not null
    references auth.users(id)
    on delete restrict,

  role_id uuid not null
    references public.roles(id)
    on delete restrict,

  status text not null default 'active'
    check (status in ('active', 'invited', 'disabled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_memberships_project_tenant_fk
    foreign key (project_id, organization_id)
    references public.projects(id, organization_id)
    on delete restrict,

  constraint project_memberships_unique_user
    unique (project_id, user_id)
);

create index project_memberships_user_id_idx
  on public.project_memberships(user_id);

create index project_memberships_organization_id_idx
  on public.project_memberships(organization_id);

create index project_memberships_project_status_idx
  on public.project_memberships(project_id, status);

create index project_memberships_role_id_idx
  on public.project_memberships(role_id);

create trigger project_memberships_set_updated_at
before update on public.project_memberships
for each row
execute function public.set_updated_at();


-- ============================================================
-- System roles
-- ============================================================

insert into public.roles (
  key,
  name,
  description,
  is_system
)
values
  (
    'CLIENT',
    'Client',
    'Client user with access to safe project content management.',
    true
  ),
  (
    'DEVELOPER',
    'Developer',
    'Developer with technical and administrative access to the project.',
    true
  );


-- ============================================================
-- Permissions
-- ============================================================

insert into public.permissions (
  key,
  description
)
values
  (
    'project.read',
    'View project information.'
  ),

  (
    'content.read',
    'View project content.'
  ),
  (
    'content.write',
    'Create and update project content.'
  ),
  (
    'content.publish',
    'Publish or hide project content.'
  ),
  (
    'content.delete',
    'Delete project content when deletion is allowed.'
  ),

  (
    'media.read',
    'View project media.'
  ),
  (
    'media.write',
    'Upload and replace project media.'
  ),
  (
    'media.delete',
    'Delete project media when deletion is allowed.'
  ),

  (
    'health.read',
    'View project health information.'
  ),

  (
    'deploy.read',
    'View deployment information.'
  ),

  (
    'errors.read',
    'View monitoring and error information.'
  ),

  (
    'analytics.read',
    'View project analytics information.'
  ),

  (
    'users.read',
    'View users with access to the project.'
  ),
  (
    'users.manage',
    'Invite, disable or change project users.'
  ),

  (
    'integrations.read',
    'View project integrations.'
  ),
  (
    'integrations.manage',
    'Connect, reconnect or disconnect project integrations.'
  ),

  (
    'audit.read',
    'View project audit events.'
  ),

  (
    'settings.read',
    'View project settings.'
  ),
  (
    'settings.write',
    'Modify project settings.'
  );


-- ============================================================
-- CLIENT permissions
-- ============================================================

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
cross join public.permissions p
where r.key = 'CLIENT'
  and p.key in (
    'project.read',

    'content.read',
    'content.write',
    'content.publish',
    'content.delete',

    'media.read',
    'media.write',
    'media.delete'
  );


-- ============================================================
-- DEVELOPER permissions
-- ============================================================

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
cross join public.permissions p
where r.key = 'DEVELOPER';


-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.roles
  enable row level security;

alter table public.permissions
  enable row level security;

alter table public.role_permissions
  enable row level security;

alter table public.project_memberships
  enable row level security;


-- ============================================================
-- Deny API access by default
-- Explicit grants and RLS policies are added separately.
-- ============================================================

revoke all on table public.roles
  from anon, authenticated;

revoke all on table public.permissions
  from anon, authenticated;

revoke all on table public.role_permissions
  from anon, authenticated;

revoke all on table public.project_memberships
  from anon, authenticated;