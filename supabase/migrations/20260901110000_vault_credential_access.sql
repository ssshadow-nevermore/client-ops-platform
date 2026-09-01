-- Supabase Vault is the only secret storage used by Deployment Health.
--
-- credential_ref values in public.provider_connections contain only the UUID
-- of a Vault secret. Browser roles must not access the Vault schema or its
-- decrypted view through the Data API.

create extension if not exists supabase_vault with schema vault;

-- Deployment Health stores the Vault secret UUID, never a provider token or
-- an unstructured reference string.
alter table public.provider_connections
  drop constraint if exists provider_connections_credential_ref_not_empty;

alter table public.provider_connections
  alter column credential_ref type uuid
  using credential_ref::uuid;

revoke all
on schema vault
from anon, authenticated;

revoke all
on table vault.secrets, vault.decrypted_secrets
from anon, authenticated;
