begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

-- ============================================================
-- Test identities
-- ============================================================

insert into auth.users (
  id,
  email
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'deployment-owner@test.local'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'deployment-developer@test.local'
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    'deployment-client@test.local'
  );


-- ============================================================
-- Organization and projects
-- ============================================================

insert into public.organizations (
  id,
  name,
  slug,
  status
)
values (
  '92000000-0000-4000-8000-000000000001',
  'Deployment Organization',
  'deployment-org',
  'active'
);

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
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'Deployment Project A',
    'deployment-project-a',
    'https://deployment-a.example',
    'active'
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000001',
    'Deployment Project B',
    'deployment-project-b',
    'https://deployment-b.example',
    'active'
  );


-- ============================================================
-- Explicit memberships
-- ============================================================

insert into public.organization_memberships (
  organization_id,
  user_id,
  role,
  status
)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'OWNER',
  'active'
);

insert into public.project_memberships (
  organization_id,
  project_id,
  user_id,
  role_id,
  status
)
select
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
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
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000003',
  id,
  'active'
from public.roles
where key = 'CLIENT';


-- ============================================================
-- Provider connection and links
-- ============================================================

insert into public.provider_connections (
  id,
  organization_id,
  provider,
  external_account_id,
  credential_ref,
  status
)
values (
  '94000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'vercel',
  'team_deployment_test',
  '95000000-0000-4000-8000-000000000001',
  'connected'
);

insert into public.project_provider_links (
  project_id,
  organization_id,
  connection_id,
  provider,
  external_project_id,
  external_project_name
)
values (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  'vercel',
  'vercel-project-a',
  'Deployment Project A'
);


-- ============================================================
-- Catalog and privilege checks
-- ============================================================

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('provider_connections', 'project_provider_links')
      and c.relrowsecurity = true
  ),
  2::bigint,
  'RLS is enabled on provider connection tables'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.provider_connections',
    'provider',
    'SELECT'
  ),
  'authenticated can select safe provider metadata'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.provider_connections',
    'credential_ref',
    'SELECT'
  ),
  'authenticated cannot select credential_ref'
);

select ok(
  has_column_privilege(
    'service_role',
    'public.provider_connections',
    'credential_ref',
    'SELECT'
  ),
  'service_role may read credential_ref for a future controlled resolver'
);


-- ============================================================
-- DEVELOPER context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000002',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select results_eq(
  $$
    select count(*)
    from public.project_provider_links
    where project_id = '93000000-0000-4000-8000-000000000001'
  $$,
  array[1::bigint],
  'DEVELOPER sees linked provider metadata for assigned project'
);

select results_eq(
  $$
    select count(*)
    from public.provider_connections
    where id = '94000000-0000-4000-8000-000000000001'
  $$,
  array[1::bigint],
  'DEVELOPER sees linked provider connection metadata'
);

select results_eq(
  $$
    select external_project_id
    from public.project_provider_links
  $$,
  array['vercel-project-a'::text],
  'DEVELOPER receives the external project id'
);

select throws_ok(
  $$
    select credential_ref
    from public.provider_connections
  $$,
  '42501',
  'permission denied for table provider_connections',
  'DEVELOPER cannot read the credential reference through the browser grant'
);

select throws_ok(
  $$
    insert into public.project_provider_links (
      project_id,
      organization_id,
      connection_id,
      provider,
      external_project_id
    )
    values (
      '93000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      'vercel',
      'blocked-write'
    )
  $$,
  '42501',
  'permission denied for table project_provider_links',
  'DEVELOPER cannot mutate provider links directly'
);

reset role;


-- ============================================================
-- CLIENT context
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000003',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select results_eq(
  $$
    select count(*)
    from public.project_provider_links
  $$,
  array[0::bigint],
  'CLIENT cannot see developer provider links'
);

select results_eq(
  $$
    select count(*)
    from public.provider_connections
  $$,
  array[0::bigint],
  'CLIENT cannot see provider connection metadata'
);

reset role;


-- ============================================================
-- OWNER without project membership
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select results_eq(
  $$
    select count(*)
    from public.project_provider_links
  $$,
  array[0::bigint],
  'OWNER without ProjectMembership cannot see provider links'
);

select results_eq(
  $$
    select count(*)
    from public.provider_connections
  $$,
  array[0::bigint],
  'OWNER without ProjectMembership cannot see provider connections'
);

reset role;


-- ============================================================
-- Integrity checks and one-to-many connection usage
-- ============================================================

select throws_ok(
  $$
    insert into public.provider_connections (
      organization_id,
      provider,
      external_account_id
    )
    values (
      '92000000-0000-4000-8000-000000000001',
      'vercel',
      'team_deployment_test'
    )
  $$,
  '23505',
  null,
  'one organization cannot duplicate a provider external account'
);

insert into public.project_provider_links (
  project_id,
  organization_id,
  connection_id,
  provider,
  external_project_id
)
values (
  '93000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  'vercel',
  'vercel-project-b'
);

select is(
  (
    select count(*)
    from public.project_provider_links
    where connection_id = '94000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'one provider connection can serve multiple projects'
);

select throws_ok(
  $$
    insert into public.project_provider_links (
      project_id,
      organization_id,
      connection_id,
      provider,
      external_project_id
    )
    values (
      '93000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      'vercel',
      'vercel-project-a-duplicate'
    )
  $$,
  '23505',
  null,
  'a project cannot have two links for the same provider'
);

select throws_ok(
  $$
    insert into public.project_provider_links (
      project_id,
      organization_id,
      connection_id,
      provider,
      external_project_id
    )
    values (
      '93000000-0000-4000-8000-000000000002',
      '92000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      'vercel',
      'vercel-project-a'
    )
  $$,
  '23505',
  null,
  'an external provider project cannot be linked twice to one connection'
);

select throws_ok(
  $$
    insert into public.project_provider_links (
      project_id,
      organization_id,
      connection_id,
      provider,
      external_project_id
    )
    values (
      '93000000-0000-4000-8000-000000000002',
      '92000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      'github',
      'github-project-b'
    )
  $$,
  '23503',
  null,
  'a provider link must match its connection provider'
);

select throws_ok(
  $$
    insert into public.provider_connections (
      organization_id,
      provider,
      credential_ref
    )
    values (
      '92000000-0000-4000-8000-000000000001',
      'vercel',
      'not-a-vault-uuid'
    )
  $$,
  '22P02',
  null,
  'credential_ref only accepts a Vault UUID'
);


select * from finish();

rollback;
