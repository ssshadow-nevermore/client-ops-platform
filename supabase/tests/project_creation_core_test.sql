begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- ============================================================
-- Test identities
-- ============================================================

insert into auth.users (
  id,
  email
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    'project-owner-a@test.local'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'project-owner-b@test.local'
  ),
  (
    '60000000-0000-4000-8000-000000000003',
    'project-regular-user@test.local'
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
    '70000000-0000-4000-8000-000000000001',
    'Project Organization A',
    'project-org-a',
    'active'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    'Project Organization B',
    'project-org-b',
    'active'
  );


-- ============================================================
-- Organization owners
-- ============================================================

insert into public.organization_memberships (
  organization_id,
  user_id,
  role,
  status
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'OWNER',
    'active'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002',
    'OWNER',
    'active'
  );


-- ============================================================
-- Test 1
-- anon cannot execute the project creation RPC.
-- ============================================================

select ok(
  not has_function_privilege(
    'anon',
    'public.create_project(uuid,text,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute create_project'
);


-- ============================================================
-- Organization A OWNER context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- ============================================================
-- Test 2
-- OWNER can create a project in own organization.
-- ============================================================

select lives_ok(
  $$
    select public.create_project(
      '70000000-0000-4000-8000-000000000001',
      'Assol Website',
      'assol-website',
      'https://assol.example'
    )
  $$,
  'organization OWNER can create project'
);


-- ============================================================
-- Test 3
-- Project row was created correctly.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.projects
    where organization_id =
      '70000000-0000-4000-8000-000000000001'
      and name = 'Assol Website'
      and slug = 'assol-website'
      and production_url = 'https://assol.example'
      and status = 'active'
  $$,
  array[1::bigint],
  'project is created with expected data'
);


-- ============================================================
-- Test 4
-- Creator receives explicit DEVELOPER ProjectMembership.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.project_memberships pm
    join public.projects p
      on p.id = pm.project_id
    join public.roles r
      on r.id = pm.role_id
    where p.organization_id =
      '70000000-0000-4000-8000-000000000001'
      and p.slug = 'assol-website'
      and pm.user_id =
        '60000000-0000-4000-8000-000000000001'
      and pm.status = 'active'
      and r.key = 'DEVELOPER'
  $$,
  array[1::bigint],
  'project creator receives active DEVELOPER membership'
);


-- ============================================================
-- Test 5
-- Project creation produces an audit event.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.audit_events ae
    join public.projects p
      on p.id = ae.project_id
    where p.organization_id =
      '70000000-0000-4000-8000-000000000001'
      and p.slug = 'assol-website'
      and ae.organization_id =
        '70000000-0000-4000-8000-000000000001'
      and ae.user_id =
        '60000000-0000-4000-8000-000000000001'
      and ae.action = 'project.create'
      and ae.entity_type = 'project'
      and ae.result = 'success'
  $$,
  array[1::bigint],
  'project creation writes audit event'
);


-- ============================================================
-- Test 6
-- Duplicate slug inside same organization returns safe error.
-- ============================================================

select throws_ok(
  $$
    select public.create_project(
      '70000000-0000-4000-8000-000000000001',
      'Duplicate Assol',
      'assol-website',
      'https://duplicate.example'
    )
  $$,
  '23505',
  'project_slug_unavailable',
  'duplicate project slug returns safe application error'
);


-- ============================================================
-- Test 7
-- Invalid slug is rejected.
-- ============================================================

select throws_ok(
  $$
    select public.create_project(
      '70000000-0000-4000-8000-000000000001',
      'Invalid Slug Project',
      'INVALID SLUG !!!',
      'https://invalid-slug.example'
    )
  $$,
  '22023',
  'invalid_project_slug',
  'invalid project slug is rejected'
);


-- ============================================================
-- Test 8
-- Invalid production URL is rejected.
-- ============================================================

select throws_ok(
  $$
    select public.create_project(
      '70000000-0000-4000-8000-000000000001',
      'Invalid URL Project',
      'invalid-url-project',
      'not-a-valid-url'
    )
  $$,
  '22023',
  'invalid_production_url',
  'invalid production URL is rejected'
);


-- ============================================================
-- Test 9
-- OWNER of Organization A cannot create project in Org B.
-- ============================================================

select throws_ok(
  $$
    select public.create_project(
      '70000000-0000-4000-8000-000000000002',
      'Foreign Organization Project',
      'foreign-project',
      'https://foreign.example'
    )
  $$,
  '42501',
  'project_creation_not_allowed',
  'OWNER cannot create project in another organization'
);


reset role;


-- ============================================================
-- Regular authenticated user context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000003',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- ============================================================
-- Test 10
-- Authenticated user without OWNER membership cannot create.
-- ============================================================

select throws_ok(
  $$
    select public.create_project(
      '70000000-0000-4000-8000-000000000001',
      'Unauthorized Project',
      'unauthorized-project',
      'https://unauthorized.example'
    )
  $$,
  '42501',
  'project_creation_not_allowed',
  'authenticated non-OWNER cannot create project'
);

-- ============================================================
-- Test 11
-- Production URL is optional.
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select lives_ok(
  $$
    select public.create_project(
      '70000000-0000-4000-8000-000000000001',
      'Project Without Production URL',
      'project-without-url',
      null
    )
  $$,
  'project can be created without production URL'
);

reset role;

select * from finish();

rollback;