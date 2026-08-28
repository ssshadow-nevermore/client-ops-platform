begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- ============================================================
-- Test identities
-- ============================================================

insert into auth.users (
  id,
  email
)
values
  (
    '80000000-0000-4000-8000-000000000001',
    'health-developer@test.local'
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    'health-client@test.local'
  );


-- ============================================================
-- Organizations
-- ============================================================

insert into public.organizations (
  id,
  name,
  slug,
  status
)
values
  (
    '81000000-0000-4000-8000-000000000001',
    'Health Organization A',
    'health-org-a',
    'active'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'Health Organization B',
    'health-org-b',
    'active'
  );


-- ============================================================
-- Projects
--
-- project_health rows must be created automatically by trigger.
-- ============================================================

insert into public.projects (
  id,
  organization_id,
  name,
  slug,
  production_url,
  status
)
values
  (
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'Health Project A',
    'health-project-a',
    'https://health-a.example',
    'active'
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    'Health Project B',
    'health-project-b',
    'https://health-b.example',
    'active'
  );


-- ============================================================
-- Memberships
-- ============================================================

insert into public.project_memberships (
  organization_id,
  project_id,
  user_id,
  role_id,
  status
)
select
  '81000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  id,
  'active'
from public.roles
where key = 'DEVELOPER';


insert into public.project_memberships (
  organization_id,
  project_id,
  user_id,
  role_id,
  status
)
select
  '81000000-0000-4000-8000-000000000002',
  '82000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000002',
  id,
  'active'
from public.roles
where key = 'CLIENT';


-- ============================================================
-- Test 1
-- RLS must be enabled.
-- ============================================================

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'project_health'
  ),
  'RLS is enabled on project_health'
);


-- ============================================================
-- Test 2
-- Health row is automatically created for every new project.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.project_health
    where project_id in (
      '82000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000002'
    )
  $$,
  array[2::bigint],
  'project insert automatically creates one health row'
);


-- ============================================================
-- Test 3
-- New project starts honestly as not configured.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.project_health
    where project_id =
      '82000000-0000-4000-8000-000000000001'
      and overall_status = 'not_configured'
      and http_status = 'not_configured'
      and ssl_status = 'not_configured'
      and deployment_status = 'not_configured'
      and critical_errors_status = 'not_configured'
      and integration_freshness_status = 'not_configured'
      and http_status_code is null
      and http_response_time_ms is null
      and ssl_expires_at is null
      and critical_error_count is null
      and last_checked_at is null
  $$,
  array[1::bigint],
  'new project health contains only not-configured signals'
);


-- ============================================================
-- DEVELOPER context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000001',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- ============================================================
-- Test 4
-- DEVELOPER has health.read and sees own project health.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.project_health
    where project_id =
      '82000000-0000-4000-8000-000000000001'
  $$,
  array[1::bigint],
  'DEVELOPER can read health for own project'
);


-- ============================================================
-- Test 5
-- Cross-tenant health remains invisible.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.project_health
    where project_id =
      '82000000-0000-4000-8000-000000000002'
  $$,
  array[0::bigint],
  'DEVELOPER cannot read health from another tenant'
);


-- ============================================================
-- Test 6
-- Browser cannot insert health snapshots directly.
-- ============================================================

select throws_ok(
  $$
    insert into public.project_health (
      project_id,
      organization_id
    )
    values (
      '82000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'permission denied for table project_health',
  'authenticated browser cannot insert project health directly'
);


-- ============================================================
-- Test 7
-- Browser cannot update health snapshots directly.
-- ============================================================

select throws_ok(
  $$
    update public.project_health
    set overall_status = 'healthy'
    where project_id =
      '82000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table project_health',
  'authenticated browser cannot update project health directly'
);


reset role;


-- ============================================================
-- CLIENT context
--
-- Current CLIENT role intentionally has no health.read.
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000002',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- ============================================================
-- Test 8
-- CLIENT cannot read Project Health without health.read.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.project_health
    where project_id =
      '82000000-0000-4000-8000-000000000002'
  $$,
  array[0::bigint],
  'CLIENT without health.read cannot read project health'
);


reset role;


-- ============================================================
-- Test 9
-- Composite project/organization FK prevents cross-tenant pair.
--
-- Remove an auto-created row as DB owner only for this fixture,
-- then try recreating it with the wrong organization.
-- ============================================================

insert into public.projects (
  id,
  organization_id,
  name,
  slug,
  production_url,
  status
)
values (
  '82000000-0000-4000-8000-000000000003',
  '81000000-0000-4000-8000-000000000001',
  'Health Project C',
  'health-project-c',
  null,
  'active'
);

delete from public.project_health
where project_id =
  '82000000-0000-4000-8000-000000000003';


select throws_ok(
  $$
    insert into public.project_health (
      project_id,
      organization_id
    )
    values (
      '82000000-0000-4000-8000-000000000003',
      '81000000-0000-4000-8000-000000000002'
    )
  $$,
  '23503',
  null,
  'project health cannot reference project with another organization'
);


-- ============================================================
-- Test 10
-- Invalid health statuses are rejected by database constraint.
-- ============================================================

select throws_ok(
  $$
    update public.project_health
    set overall_status = 'totally_broken'
    where project_id =
      '82000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'invalid health status is rejected'
);


select * from finish();

rollback;