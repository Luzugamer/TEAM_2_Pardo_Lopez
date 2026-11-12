import { createRequire } from 'node:module';
const requireFromApi = createRequire(new URL('../apps/configuration-api/package.json', import.meta.url));
const { Client } = requireFromApi('pg');

// Only used by the isolated local Compose project, never by Nexo's shared database.
if (process.env.LOCAL_BOOTSTRAP_CONFIRM !== 'isolated-development-only' || process.env.POSTGRES_HOST !== 'db') {
  throw new Error('Local bootstrap is restricted to the isolated Compose database.');
}
const migrator = process.env.EVENTS_MIGRATOR_USER || 'events_migrator';
const runtime = process.env.APP_DB_USER || 'configuration_app';
const migratorPassword = process.env.EVENTS_MIGRATOR_PASSWORD;
const runtimePassword = process.env.APP_DB_PASSWORD;
const admin = process.env.POSTGRES_USER;
for (const name of [migrator, runtime, admin]) {
  if (!name || !/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Invalid local role name.');
}
if (new Set([migrator, runtime, admin]).size !== 3 || !migratorPassword || !runtimePassword) throw new Error('Local roles must be distinct and passwords configured.');
const ident = (value) => `"${value}"`;
const literal = (value) => `'${value.replace(/'/g, "''")}'`;
const client = new Client({ host: 'db', port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB, user: admin, password: process.env.POSTGRES_PASSWORD });
try {
  await client.connect();
  const legacy = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS legacy");
  if (legacy.rows[0].legacy) throw new Error('Legacy public schema detected; use a fresh isolated volume or an explicit data migration.');
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
  for (const [name, password] of [[migrator, migratorPassword], [runtime, runtimePassword]]) {
    const result = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name]);
    const command = result.rowCount ? 'ALTER ROLE' : 'CREATE ROLE';
    await client.query(`${command} ${ident(name)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(password)}`);
  }
  await client.query(`CREATE SCHEMA IF NOT EXISTS events AUTHORIZATION ${ident(migrator)}`);
  const owner = await client.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'events'");
  if (owner.rows[0]?.owner !== migrator) throw new Error('The events schema has an unexpected owner.');
  await client.query('CREATE SCHEMA IF NOT EXISTS platform_meta');
  await client.query(`GRANT USAGE ON SCHEMA events TO ${ident(runtime)}`);
  await client.query(`GRANT USAGE ON SCHEMA platform_meta TO ${ident(migrator)}`);
  await client.query('CREATE TABLE IF NOT EXISTS platform_meta.events_schema_migrations (version bigint NOT NULL PRIMARY KEY, dirty boolean NOT NULL)');
  await client.query('CREATE TABLE IF NOT EXISTS platform_meta.events_migration_checksums (version bigint PRIMARY KEY, filename text UNIQUE NOT NULL, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  await client.query(`ALTER TABLE platform_meta.events_schema_migrations OWNER TO ${ident(migrator)}`);
  await client.query(`ALTER TABLE platform_meta.events_migration_checksums OWNER TO ${ident(migrator)}`);
  console.log('Bootstrap local completado: schemas, extensiones y roles preparados.');
} finally { await client.end(); }
