begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

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
    'audit-user-a@test.local'
  ),
  (
    '61018c32-e5c6-47bd-aeac-a8c1ef28ec02',
    'audit-user-b@test.local'
  );


-- ============================================================
-- Organizations
-- ============================================================

insert into public.organizations (
  id,
  name,
  slug
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Audit Organization A',
    'audit-org-a'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Audit Organization B',
    'audit-org-b'
  );


-- User A is OWNER of Organization A.
-- User B intentionally has no organization membership.

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
    'Audit Project A',
    'audit-project-a',
    'https://audit-a.example'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'Audit Project B',
    'audit-project-b',
    'https://audit-b.example'
  );


-- ============================================================
-- Project memberships
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
-- Audit fixtures
--
-- These are inserted as database owner for test setup.
-- ============================================================

insert into public.audit_events (
  id,
  organization_id,
  project_id,
  user_id,
  action,
  entity_type,
  entity_id,
  result,
  metadata
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '0b3f0eca-bc0c-4abe-a203-94f7bd7cd515',
    'project.update',
    'project',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'success',
    '{"source":"test"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '61018c32-e5c6-47bd-aeac-a8c1ef28ec02',
    'content.update',
    'content_entry',
    'test-entry',
    'success',
    '{"source":"test"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    null,
    '0b3f0eca-bc0c-4abe-a203-94f7bd7cd515',
    'organization.update',
    'organization',
    '11111111-1111-4111-8111-111111111111',
    'success',
    '{"source":"test"}'::jsonb
  );


-- ============================================================
-- Test 1
-- audit_events must have RLS enabled.
-- ============================================================

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'audit_events'
  ),
  'RLS is enabled on audit_events'
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
  'select count(*) from public.audit_events',
  array[0::bigint],
  'CLIENT without audit.read sees no audit events'
);


-- Test 3
select throws_ok(
  $$
    insert into public.audit_events (
      organization_id,
      project_id,
      user_id,
      action,
      entity_type,
      result
    )
    values (
      '22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '61018c32-e5c6-47bd-aeac-a8c1ef28ec02',
      'audit.hack',
      'project',
      'success'
    )
  $$,
  '42501',
  'permission denied for table audit_events',
  'Authenticated browser cannot insert audit events directly'
);


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


-- Project A audit + Organization A audit.
-- Project B must remain invisible.

-- Test 4
select results_eq(
  'select count(*) from public.audit_events',
  array[2::bigint],
  'DEVELOPER sees only authorized project and organization audit'
);


-- Test 5
select results_eq(
  $$
    select count(*)
    from public.audit_events
    where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  $$,
  array[1::bigint],
  'DEVELOPER sees audit for own project'
);


-- Test 6
select results_eq(
  $$
    select count(*)
    from public.audit_events
    where project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  $$,
  array[0::bigint],
  'DEVELOPER cannot see audit from another tenant'
);


-- Test 7
select results_eq(
  $$
    select count(*)
    from public.audit_events
    where project_id is null
      and organization_id = '11111111-1111-4111-8111-111111111111'
  $$,
  array[1::bigint],
  'Organization OWNER sees own organization-level audit'
);


reset role;


-- ============================================================
-- Append-only database protection
--
-- Run as database owner so we test the trigger itself,
-- not merely missing authenticated SQL privileges.
-- ============================================================

-- Test 8
select throws_ok(
  $$
    update public.audit_events
    set action = 'tampered'
    where id = '10000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'audit_events is append-only',
  'Audit event cannot be updated even by database owner'
);


-- Test 9
select throws_ok(
  $$
    delete from public.audit_events
    where id = '10000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'audit_events is append-only',
  'Audit event cannot be deleted even by database owner'
);


select * from finish();

rollback;
