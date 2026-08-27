-- Core Row Level Security policies.
--
-- Important:
-- - anon receives no access.
-- - authenticated access is explicitly granted below.
-- - RLS determines which rows an authenticated user may access.
-- - destructive / administrative writes remain denied by default.
-- - organization/project creation and membership management will use
--   dedicated server-side flows added separately.

-- ============================================================
-- Authorization helper functions
-- ============================================================

create or replace function public.is_active_organization_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = target_organization_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
  );
$$;


create or replace function public.is_organization_owner(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = target_organization_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
      and om.role = 'OWNER'
  );
$$;


create or replace function public.has_project_access(
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.status = 'active'
  );
$$;


create or replace function public.has_project_permission(
  target_project_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_memberships pm
    join public.role_permissions rp
      on rp.role_id = pm.role_id
    join public.permissions p
      on p.id = rp.permission_id
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.status = 'active'
      and p.key = target_permission_key
  );
$$;


-- ============================================================
-- Restrict helper execution
-- ============================================================

revoke all on function public.is_active_organization_member(uuid)
  from public, anon;

revoke all on function public.is_organization_owner(uuid)
  from public, anon;

revoke all on function public.has_project_access(uuid)
  from public, anon;

revoke all on function public.has_project_permission(uuid, text)
  from public, anon;

grant execute on function public.is_active_organization_member(uuid)
  to authenticated;

grant execute on function public.is_organization_owner(uuid)
  to authenticated;

grant execute on function public.has_project_access(uuid)
  to authenticated;

grant execute on function public.has_project_permission(uuid, text)
  to authenticated;


-- ============================================================
-- SQL privileges
-- ============================================================

-- profiles:
-- authenticated users may read/create/update only their own row
-- through RLS policies below.

grant select, insert, update
  on table public.profiles
  to authenticated;


-- organizations:
-- members may read;
-- OWNER may update.
-- Creation is handled later through a secure bootstrap flow.

grant select, update
  on table public.organizations
  to authenticated;


-- organization memberships:
-- read only through RLS.
-- Membership mutations are server-controlled.

grant select
  on table public.organization_memberships
  to authenticated;


-- projects:
-- project members may read according to permissions;
-- users with settings.write may update.
-- Creation is handled separately.

grant select, update
  on table public.projects
  to authenticated;


-- project memberships:
-- read only through RLS.
-- User management stays server-controlled.

grant select
  on table public.project_memberships
  to authenticated;


-- System authorization catalog:
-- safe read-only metadata for authenticated users.

grant select
  on table public.roles
  to authenticated;

grant select
  on table public.permissions
  to authenticated;

grant select
  on table public.role_permissions
  to authenticated;


-- ============================================================
-- profiles policies
-- ============================================================

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
);


create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  id = (select auth.uid())
);


create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
)
with check (
  id = (select auth.uid())
);


-- ============================================================
-- organizations policies
-- ============================================================

create policy "organizations_select_active_member"
on public.organizations
for select
to authenticated
using (
  public.is_active_organization_member(id)
);


create policy "organizations_update_owner"
on public.organizations
for update
to authenticated
using (
  public.is_organization_owner(id)
)
with check (
  public.is_organization_owner(id)
);


-- ============================================================
-- organization_memberships policies
-- ============================================================

create policy "organization_memberships_select_own_or_owner"
on public.organization_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_organization_owner(organization_id)
);


-- ============================================================
-- projects policies
-- ============================================================

create policy "projects_select_with_permission"
on public.projects
for select
to authenticated
using (
  public.has_project_permission(
    id,
    'project.read'
  )
);


create policy "projects_update_with_settings_permission"
on public.projects
for update
to authenticated
using (
  public.has_project_permission(
    id,
    'settings.write'
  )
)
with check (
  public.has_project_permission(
    id,
    'settings.write'
  )
);


-- ============================================================
-- project_memberships policies
-- ============================================================

create policy "project_memberships_select_own_or_users_read"
on public.project_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.has_project_permission(
    project_id,
    'users.read'
  )
);


-- ============================================================
-- roles policies
-- ============================================================

create policy "roles_select_authenticated"
on public.roles
for select
to authenticated
using (true);


-- ============================================================
-- permissions policies
-- ============================================================

create policy "permissions_select_authenticated"
on public.permissions
for select
to authenticated
using (true);


-- ============================================================
-- role_permissions policies
-- ============================================================

create policy "role_permissions_select_authenticated"
on public.role_permissions
for select
to authenticated
using (true);