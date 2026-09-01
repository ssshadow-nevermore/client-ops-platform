begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- The test secret is deliberately fake and is rolled back with this test.
create temporary table vault_test_secret (
  id uuid not null
);

insert into vault_test_secret (id)
select vault.create_secret(
  'test-only-fake-vault-value',
  'deployment-health-vault-test',
  'test-only secret; never a real provider token',
  null
);

select ok(
  exists (
    select 1
    from pg_extension
    where extname = 'supabase_vault'
  ),
  'Supabase Vault extension is installed'
);

select ok(
  to_regclass('vault.decrypted_secrets') is not null,
  'Vault decrypted_secrets view exists'
);

select ok(
  has_schema_privilege('postgres', 'vault', 'USAGE'),
  'server database role can use the Vault schema'
);

select is(
  (
    select ds.decrypted_secret
    from vault.decrypted_secrets ds
    join vault_test_secret ts on ts.id = ds.id
  ),
  'test-only-fake-vault-value',
  'server database role can resolve the fake Vault secret'
);

select ok(
  not has_schema_privilege('anon', 'vault', 'USAGE'),
  'anon cannot use the Vault schema'
);

select ok(
  not has_schema_privilege('authenticated', 'vault', 'USAGE'),
  'authenticated cannot use the Vault schema'
);

select ok(
  not has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT'),
  'anon cannot select decrypted secrets'
);

select ok(
  not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT'),
  'authenticated cannot select decrypted secrets'
);

select ok(
  not has_table_privilege('anon', 'vault.secrets', 'SELECT'),
  'anon cannot select encrypted Vault rows'
);

select ok(
  not has_table_privilege('authenticated', 'vault.secrets', 'SELECT'),
  'authenticated cannot select encrypted Vault rows'
);

select ok(
  not has_function_privilege(
    'anon',
    'vault.create_secret(text,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'vault.create_secret(text,text,text,uuid)',
    'EXECUTE'
  ),
  'browser roles cannot execute Vault secret management functions'
);

select * from finish();

rollback;
