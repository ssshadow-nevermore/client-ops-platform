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
    '30000000-0000-4000-8000-000000000001',
    'bootstrap-developer@test.local'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'bootstrap-client@test.local'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'bootstrap-invalid@test.local'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'bootstrap-duplicate@test.local'
  );


-- ============================================================
-- Existing CLIENT fixture
--
-- User 2 already belongs to a project as CLIENT and therefore
-- must not be allowed to use first-developer bootstrap.
-- ============================================================

insert into public.organizations (
  id,
  name,
  slug
)
values (
  '40000000-0000-4000-8000-000000000001',
  'Existing Client Organization',
  'existing-client-org'
);

insert into public.projects (
  id,
  organization_id,
  name,
  slug,
  production_url
)
values (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Existing Client Project',
  'existing-client-project',
  'https://client.example'
);

insert into public.project_memberships (
  organization_id,
  project_id,
  user_id,
  role_id,
  status
)
select
  '40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  id,
  'active'
from public.roles
where key = 'CLIENT';


-- ============================================================
-- Test 1
-- anon must not have EXECUTE privilege.
-- ============================================================

select ok(
  not has_function_privilege(
    'anon',
    'public.bootstrap_organization(text,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute organization bootstrap'
);


-- ============================================================
-- New DEVELOPER bootstrap context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- Test 2
select lives_ok(
  $$
    select public.bootstrap_organization(
      'My Development Studio',
      'my-development-studio',
      'Test Developer'
    )
  $$,
  'new authenticated user can bootstrap first organization'
);


-- Test 3
select results_eq(
  $$
    select count(*)
    from public.profiles
    where id = '30000000-0000-4000-8000-000000000001'
      and display_name = 'Test Developer'
  $$,
  array[1::bigint],
  'bootstrap creates developer profile'
);


-- Test 4
select results_eq(
  $$
    select count(*)
    from public.organizations
    where slug = 'my-development-studio'
      and name = 'My Development Studio'
  $$,
  array[1::bigint],
  'bootstrap creates organization'
);


-- Test 5
select results_eq(
  $$
    select count(*)
    from public.organization_memberships om
    join public.organizations o
      on o.id = om.organization_id
    where o.slug = 'my-development-studio'
      and om.user_id = '30000000-0000-4000-8000-000000000001'
      and om.role = 'OWNER'
      and om.status = 'active'
  $$,
  array[1::bigint],
  'bootstrap creates active OWNER membership'
);


-- Test 6
select results_eq(
  $$
    select count(*)
    from public.audit_events ae
    join public.organizations o
      on o.id = ae.organization_id
    where o.slug = 'my-development-studio'
      and ae.project_id is null
      and ae.user_id = '30000000-0000-4000-8000-000000000001'
      and ae.action = 'organization.bootstrap'
      and ae.entity_type = 'organization'
      and ae.result = 'success'
  $$,
  array[1::bigint],
  'bootstrap creates organization audit event'
);


-- Test 7
select throws_ok(
  $$
    select public.bootstrap_organization(
      'Another Organization',
      'another-organization',
      'Test Developer'
    )
  $$,
  '42501',
  'organization_bootstrap_not_allowed',
  'same user cannot bootstrap a second organization'
);


reset role;


-- ============================================================
-- Existing CLIENT context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000002',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- Test 8
select throws_ok(
  $$
    select public.bootstrap_organization(
      'Client Tries To Become Owner',
      'client-owner-attempt',
      'Existing Client'
    )
  $$,
  '42501',
  'organization_bootstrap_not_allowed',
  'existing CLIENT cannot use first-developer bootstrap'
);


reset role;


-- ============================================================
-- Invalid input context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000003',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- Test 9
select throws_ok(
  $$
    select public.bootstrap_organization(
      'Invalid Slug Organization',
      'INVALID SLUG !!!',
      'Invalid User'
    )
  $$,
  '22023',
  'invalid_organization_slug',
  'invalid organization slug is rejected'
);


reset role;


-- ============================================================
-- Duplicate slug context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000004',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- Test 10
select throws_ok(
  $$
    select public.bootstrap_organization(
      'Duplicate Organization',
      'my-development-studio',
      'Duplicate User'
    )
  $$,
  '23505',
  'organization_slug_unavailable',
  'duplicate slug returns safe application error'
);


reset role;

select * from finish();

rollback;