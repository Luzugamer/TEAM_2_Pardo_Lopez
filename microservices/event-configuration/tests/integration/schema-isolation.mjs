import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Run only inside a purpose-built throwaway Compose project, never against Nexo.
if (process.env.SCHEMA_TEST_CONFIRM !== 'isolated-events-schema-test' || process.env.POSTGRES_DB !== 'nexo_events_schema_test') {
  throw new Error('Requires an explicitly confirmed isolated nexo_events_schema_test database.');
}
const { Pool } = createRequire('/app/apps/configuration-api/package.json')('pg');
const pool = new Pool({ host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, options: '-c search_path=events,public', max: 1 });
after(async () => pool.end());
const orgA = '0194eb00-0000-7000-8000-000000000001';
const orgB = '0194eb00-0000-7000-8000-000000000002';
const eventA = '0194eb11-1000-7000-8000-000000000001';
async function scoped(org, work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); if (org) await client.query("SELECT set_config('app.current_organization_id',$1,true)", [org]); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

test('role, schema, RLS and metadata privileges match the isolation boundary', async () => {
  const q = await pool.query(`SELECT current_schema() AS schema, r.rolsuper, r.rolbypassrls,
    has_schema_privilege(current_user,'events','CREATE') AS can_create,
    has_schema_privilege(current_user,'platform_meta','USAGE') AS can_read_meta,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='events' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) AS protected_tables
    FROM pg_roles r WHERE r.rolname=current_user`);
  assert.deepEqual(q.rows[0], { schema: 'events', rolsuper: false, rolbypassrls: false, can_create: false, can_read_meta: false, protected_tables: 19 });
});

test('tenant isolation survives commit, rollback, and reused pool connections', async () => {
  assert.equal((await scoped(orgA, c => c.query('SELECT id FROM events.events WHERE id=$1',[eventA]))).rowCount, 1);
  assert.equal((await scoped(orgB, c => c.query('SELECT id FROM events.events WHERE id=$1',[eventA]))).rowCount, 0);
  assert.equal((await scoped(null, c => c.query('SELECT id FROM events.events WHERE id=$1',[eventA]))).rowCount, 0);
  assert.equal((await scoped(orgB, c => c.query("UPDATE events.events SET title='forbidden' WHERE id=$1",[eventA]))).rowCount, 0);
  await assert.rejects(scoped(orgB, c => c.query(`INSERT INTO events.events (id, organization_id, site_id, slug, kind, title, timezone, starts_at, ends_at)
    VALUES ('0194eb11-1000-7000-8000-000000000099',$1,'0194eb11-3000-7000-8000-000000000001','cross-tenant','conference','Forbidden','UTC',now(),now()+interval '1 hour')`,[orgA])), { code: '42501' });
  assert.equal((await scoped(null, c => c.query('SELECT id FROM events.events WHERE id=$1',[eventA]))).rowCount, 0);
});

test('runtime cannot access another schema or migration metadata', async () => {
  await assert.rejects(pool.query('SELECT * FROM integration_other.private_data'), { code: '42501' });
  await assert.rejects(pool.query('SELECT * FROM platform_meta.events_schema_migrations'), { code: '42501' });
  await assert.rejects(pool.query('CREATE TABLE events.forbidden(id int)'), { code: '42501' });
});
