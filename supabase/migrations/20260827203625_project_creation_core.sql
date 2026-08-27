-- Secure project creation flow.
--
-- authenticated Organization OWNER
--   -> validate input
--   -> verify active organization ownership
--   -> create project
--   -> grant creator DEVELOPER project membership
--   -> append audit event
--   -> return project id
--
-- Direct INSERT into projects / project_memberships remains unavailable.

create or replace function public.create_project(
  target_organization_id uuid,
  target_name text,
  target_slug text,
  target_production_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  developer_role_id uuid;
  new_project_id uuid;

  normalized_name text;
  normalized_slug text;
  normalized_production_url text;
begin
  -- ==========================================================
  -- Authentication
  -- ==========================================================

  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'authentication_required'
      using errcode = '42501';
  end if;


  -- ==========================================================
  -- Validate organization id
  -- ==========================================================

  if target_organization_id is null then
    raise exception 'invalid_organization'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Normalize input
  -- ==========================================================

  normalized_name := nullif(trim(target_name), '');
  normalized_slug := nullif(lower(trim(target_slug)), '');
  normalized_production_url :=
    nullif(trim(target_production_url), '');


  -- ==========================================================
  -- Validate project name
  -- ==========================================================

  if normalized_name is null
     or length(normalized_name) < 2
     or length(normalized_name) > 120 then
    raise exception 'invalid_project_name'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Validate project slug
  -- ==========================================================

  if normalized_slug is null
     or length(normalized_slug) < 3
     or length(normalized_slug) > 63
     or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_project_slug'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Validate optional production URL
  -- ==========================================================

  if normalized_production_url is not null
     and normalized_production_url !~*
       '^https?://[^[:space:]]+$' then
    raise exception 'invalid_production_url'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Serialize project creation inside this organization.
  --
  -- This also makes concurrent duplicate-slug creation
  -- deterministic before the unique constraint is reached.
  -- ==========================================================

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(target_organization_id::text)
  );


  -- ==========================================================
  -- Authorization
  --
  -- Project creation is currently an OWNER-only operation.
  -- Organization must also be active.
  -- ==========================================================

  if not exists (
    select 1
    from public.organizations o
    join public.organization_memberships om
      on om.organization_id = o.id
    where o.id = target_organization_id
      and o.status = 'active'
      and om.user_id = current_user_id
      and om.role = 'OWNER'
      and om.status = 'active'
  ) then
    raise exception 'project_creation_not_allowed'
      using errcode = '42501';
  end if;


  -- ==========================================================
  -- Resolve DEVELOPER role
  -- ==========================================================

  select r.id
  into developer_role_id
  from public.roles r
  where r.key = 'DEVELOPER';

  if developer_role_id is null then
    raise exception 'developer_role_not_configured';
  end if;


  -- ==========================================================
  -- Create project
  -- ==========================================================

  insert into public.projects (
    organization_id,
    name,
    slug,
    production_url,
    status
  )
  values (
    target_organization_id,
    normalized_name,
    normalized_slug,
    normalized_production_url,
    'active'
  )
  returning id into new_project_id;


  -- ==========================================================
  -- Give creator explicit project access.
  --
  -- Organization OWNER does not implicitly gain project
  -- permissions in our authorization model.
  -- ==========================================================

  insert into public.project_memberships (
    organization_id,
    project_id,
    user_id,
    role_id,
    status
  )
  values (
    target_organization_id,
    new_project_id,
    current_user_id,
    developer_role_id,
    'active'
  );


  -- ==========================================================
  -- Audit
  -- ==========================================================

  perform private.write_audit_event(
    target_organization_id,
    new_project_id,
    current_user_id,
    'project.create',
    'project',
    new_project_id::text,
    'success',
    pg_catalog.jsonb_build_object(
      'source',
      'project_creation'
    )
  );


  return new_project_id;


exception
  when unique_violation then
    -- Do not expose internal constraint names/details.
    raise exception 'project_slug_unavailable'
      using errcode = '23505';
end;
$$;


-- ============================================================
-- Function privileges
-- ============================================================

revoke all on function public.create_project(
  uuid,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute on function public.create_project(
  uuid,
  text,
  text,
  text
)
to authenticated;