-- Allow the controlled Health writer to persist existing project health rows.
-- Browser users remain read-only and the project_health RLS model is unchanged.

revoke all
on table public.project_health
from service_role;

grant select, update
on table public.project_health
to service_role;