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
    '0b3f0eca-bc0c-4abe-a203-94f7bd7cd515',
    'rls-user-a@test.local'
  ),
  (
    '61018c32-e5c6-47bd-aeac-a8c1ef28ec02',
    'rls-user-b@test.local'
  );


-- ============================================================
-- Test organizations
-- ============================================================

insert into public.organizations (
  id,
  name,
  slug
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'RLS Organization A',
    'rls-org-a'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'RLS Organization B',
    'rls-org-b'
  );


-- ============================================================
-- Organization membership
--
-- User A is an internal OWNER.
-- User B is intentionally NOT an organization member.
-- ============================================================

insert into public.organization_memberships (
  organization_id,
  user_id,
  role,
  status
)
values (
  '11111111-1111-4111-8111-111111111111',
  '0b3f0eca-bc0c-4abe-a203-94f7bd7cd515',
  'OWNER',
  'active'
);


-- ============================================================
-- Projects
-- ============================================================

insert into public.projects (
  id,
  organization_id,
  name,
  slug,
  production_url
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'RLS Project A',
    'rls-project-a',
    'https://project-a.example'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'RLS Project B',
    'rls-project-b',
    'https://project-b.example'
  );


-- ============================================================
-- Project memberships
--
-- User A → DEVELOPER → Project A
-- User B → CLIENT    → Project B
-- ============================================================

insert into public.project_memberships (
  organization_id,
  project_id,
  user_id,
  role_id,
  status
)
select
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '0b3f0eca-bc0c-4abe-a203-94f7bd7cd515',
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
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '61018c32-e5c6-47bd-aeac-a8c1ef28ec02',
  id,
  'active'
from public.roles
where key = 'CLIENT';


-- ============================================================
-- Test 1
-- RLS must be enabled on every current API-facing core table.
-- ============================================================

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'profiles',
        'organizations',
        'organization_memberships',
        'projects',
        'roles',
        'permissions',
        'role_permissions',
        'project_memberships'
      )
      and c.relrowsecurity = true
  ),
  8::bigint,
  'RLS is enabled on all current core tables'
);


-- ============================================================
-- CLIENT context — User B
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '61018c32-e5c6-47bd-aeac-a8c1ef28ec02',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- Test 2
select results_eq(
  'select count(*) from public.projects',
  array[1::bigint],
  'CLIENT sees exactly one project'
);


-- Test 3
select results_eq(
  'select name from public.projects',
  array['RLS Project B'::text],
  'CLIENT sees only assigned Project B'
);


-- Test 4
select results_eq(
  'select count(*) from public.organizations',
  array[0::bigint],
  'CLIENT without organization membership sees no organizations'
);


-- Test 5
select results_eq(
  'select count(*) from public.project_memberships',
  array[1::bigint],
  'CLIENT sees only own project membership'
);


-- Test 6
select results_eq(
  $$
    with attempted_update as (
      update public.projects
      set name = 'HACKED BY CLIENT'
      where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      returning id
    )
    select count(*) from attempted_update
  $$,
  array[0::bigint],
  'CLIENT cannot update project settings'
);


-- ============================================================
-- Return to database owner before switching identity
-- ============================================================

reset role;


-- ============================================================
-- DEVELOPER context — User A
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '0b3f0eca-bc0c-4abe-a203-94f7bd7cd515',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);


-- Test 7
select results_eq(
  'select count(*) from public.projects',
  array[1::bigint],
  'DEVELOPER sees exactly one assigned project'
);


-- Test 8
select results_eq(
  'select name from public.projects',
  array['RLS Project A'::text],
  'DEVELOPER sees only assigned Project A'
);


-- Test 9
select results_eq(
  'select count(*) from public.organizations',
  array[1::bigint],
  'Organization OWNER sees own organization'
);


-- Test 10
select results_eq(
  $$
    with attempted_update as (
      update public.projects
      set name = 'UPDATED BY DEVELOPER'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      returning id
    )
    select count(*) from attempted_update
  $$,
  array[1::bigint],
  'DEVELOPER can update own project settings'
);


-- Test 11
select results_eq(
  $$
    with attempted_update as (
      update public.projects
      set name = 'HACKED PROJECT B'
      where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      returning id
    )
    select count(*) from attempted_update
  $$,
  array[0::bigint],
  'DEVELOPER cannot update another tenant project'
);


reset role;

select * from finish();

rollback;