-- Secure first-organization bootstrap.
--
-- Flow:
-- authenticated user
--   -> validate input
--   -> ensure this really is a first-time bootstrap
--   -> ensure profile exists
--   -> create organization
--   -> create OWNER membership
--   -> append audit event
--   -> return organization id
--
-- Direct INSERT into organizations / memberships remains unavailable.

create or replace function public.bootstrap_organization(
  target_name text,
  target_slug text,
  target_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  new_organization_id uuid;
  normalized_name text;
  normalized_slug text;
  normalized_display_name text;
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
  -- Normalize input
  -- ==========================================================

  normalized_name := trim(target_name);
  normalized_slug := lower(trim(target_slug));
  normalized_display_name := nullif(trim(target_display_name), '');


  -- ==========================================================
  -- Validate organization name
  -- ==========================================================

  if normalized_name is null
     or length(normalized_name) < 2
     or length(normalized_name) > 120 then
    raise exception 'invalid_organization_name'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Validate slug
  -- ==========================================================

  if normalized_slug is null
     or length(normalized_slug) < 3
     or length(normalized_slug) > 63
     or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_organization_slug'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Validate optional display name
  -- ==========================================================

  if normalized_display_name is not null
     and length(normalized_display_name) > 120 then
    raise exception 'invalid_display_name'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Prevent concurrent bootstrap for the same user
  -- ==========================================================

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(current_user_id::text)
  );


  -- ==========================================================
  -- First-time bootstrap only
  --
  -- A user who already belongs to an organization must use
  -- the future organization-management flow instead.
  -- ==========================================================

  if exists (
    select 1
    from public.organization_memberships om
    where om.user_id = current_user_id
  ) then
    raise exception 'organization_bootstrap_not_allowed'
      using errcode = '42501';
  end if;


  -- ==========================================================
  -- Prevent an existing project CLIENT/member from using the
  -- first-developer bootstrap endpoint to become an OWNER.
  -- ==========================================================

  if exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = current_user_id
  ) then
    raise exception 'organization_bootstrap_not_allowed'
      using errcode = '42501';
  end if;


  -- ==========================================================
  -- Ensure profile exists
  -- ==========================================================

  insert into public.profiles (
    id,
    display_name
  )
  values (
    current_user_id,
    normalized_display_name
  )
  on conflict (id)
  do update
    set display_name = coalesce(
      public.profiles.display_name,
      excluded.display_name
    );


  -- ==========================================================
  -- Create organization
  -- ==========================================================

  insert into public.organizations (
    name,
    slug,
    status
  )
  values (
    normalized_name,
    normalized_slug,
    'active'
  )
  returning id into new_organization_id;


  -- ==========================================================
  -- Create OWNER membership
  -- ==========================================================

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    new_organization_id,
    current_user_id,
    'OWNER',
    'active'
  );


  -- ==========================================================
  -- Audit
  -- ==========================================================

  perform private.write_audit_event(
    new_organization_id,
    null,
    current_user_id,
    'organization.bootstrap',
    'organization',
    new_organization_id::text,
    'success',
    jsonb_build_object(
      'source',
      'bootstrap'
    )
  );


  return new_organization_id;


exception
  when unique_violation then
    -- Do not expose internal constraint names.
    raise exception 'organization_slug_unavailable'
      using errcode = '23505';
end;
$$;


-- ============================================================
-- Function privileges
-- ============================================================

revoke all on function public.bootstrap_organization(
  text,
  text,
  text
)
from public, anon;

grant execute on function public.bootstrap_organization(
  text,
  text,
  text
)
to authenticated;