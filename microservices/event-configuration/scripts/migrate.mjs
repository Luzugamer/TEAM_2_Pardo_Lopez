import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { Client } = createRequire(new URL('../apps/configuration-api/package.json', import.meta.url))('pg');
const migrationDirectory = new URL('../db/nexo-migrations/', import.meta.url);
const runtime = process.env.APP_DB_USER || 'configuration_app';
if (!/^[a-z_][a-z0-9_]*$/.test(runtime)) throw new Error('Invalid runtime role.');
const client = new Client({ host: process.env.POSTGRES_HOST || 'db', port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB || 'event_configuration', user: process.env.EVENTS_MIGRATOR_USER || 'events_migrator', password: process.env.EVENTS_MIGRATOR_PASSWORD, options: '-c search_path=events,public' });
const tableGrants = [
  ['events', 'SELECT, INSERT, UPDATE'], ['event_revisions', 'SELECT, INSERT'], ['assignments', 'SELECT, INSERT, UPDATE'],
  ['releases', 'SELECT, INSERT'], ['release_artifacts', 'SELECT, INSERT'], ['release_consumers', 'SELECT'],
  ['audit', 'SELECT, INSERT'], ['outbox', 'SELECT, INSERT, UPDATE'], ['idempotency_records', 'SELECT, INSERT'],
  ['venues', 'SELECT, INSERT, UPDATE'], ['programs', 'SELECT, INSERT, UPDATE'], ['sessions', 'SELECT, INSERT, UPDATE'],
  ['resource_reservations', 'SELECT, INSERT, UPDATE'], ['speakers', 'SELECT, INSERT, UPDATE'],
  ['session_speakers', 'SELECT, INSERT, UPDATE'], ['speaker_consent_history', 'SELECT, INSERT'],
  ['form_definitions', 'SELECT, INSERT, UPDATE'], ['form_versions', 'SELECT, INSERT, UPDATE'], ['form_bindings', 'SELECT, INSERT, UPDATE'],
];
try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('nexo.events.schema.migrations'))");
  const state = await client.query('SELECT version, dirty FROM platform_meta.events_schema_migrations');
  if (state.rowCount > 1 || state.rows[0]?.dirty) throw new Error('Events migration metadata is invalid or dirty; inspect before recovery.');
  const currentVersion = Number(state.rows[0]?.version || 0);
  const names = (await readdir(migrationDirectory)).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort();
  if (!names.length) throw new Error('No events migrations found.');
  const migrations = await Promise.all(names.map(async filename => {
    const sql = await readFile(new URL(filename, migrationDirectory), 'utf8');
    return { version: Number(filename.split('_')[0]), filename, sql, sha256: createHash('sha256').update(sql).digest('hex') };
  }));
  if (new Set(migrations.map(x => x.version)).size !== migrations.length) throw new Error('Duplicate migration version.');
  const checksums = await client.query('SELECT version, filename, sha256 FROM platform_meta.events_migration_checksums ORDER BY version');
  const applied = migrations.filter(m => m.version <= currentVersion);
  if ((currentVersion && !applied.some(m => m.version === currentVersion)) || checksums.rowCount !== applied.length || applied.some((m, i) => Number(checksums.rows[i]?.version) !== m.version || checksums.rows[i]?.filename !== m.filename || checksums.rows[i]?.sha256 !== m.sha256)) {
    throw new Error('Events migration history mismatch; do not rewrite applied migrations.');
  }
  for (const migration of migrations.filter(m => m.version > currentVersion)) {
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM platform_meta.events_schema_migrations');
      await client.query('INSERT INTO platform_meta.events_schema_migrations (version, dirty) VALUES ($1, true)', [migration.version]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL search_path TO events, public');
      await client.query(migration.sql);
      await client.query('INSERT INTO platform_meta.events_migration_checksums (version, filename, sha256) VALUES ($1,$2,$3)', [migration.version, migration.filename, migration.sha256]);
      await client.query('UPDATE platform_meta.events_schema_migrations SET dirty = false WHERE version = $1', [migration.version]);
      await client.query('COMMIT');
      console.log(`Aplicada: ${migration.filename}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  for (const [table, permissions] of tableGrants) await client.query(`GRANT ${permissions} ON TABLE events."${table}" TO "${runtime}"`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA events TO "${runtime}"`);
  console.log('Migraciones y permisos del schema events verificados.');
} catch (error) {
  console.error('Falló la migración de events:', error.message);
  process.exitCode = 1;
} finally { await client.end(); }
