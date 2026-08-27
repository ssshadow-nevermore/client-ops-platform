-- Projects may exist before a production domain is connected.
-- Keep production_url nullable until the site is deployed or linked.

alter table public.projects
  alter column production_url drop not null;