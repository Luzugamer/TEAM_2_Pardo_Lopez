import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { OutboxRepository } from '../../apps/configuration-worker/src/infrastructure/persistence/outbox-repository.mjs';
import { OutboxRelay } from '../../apps/configuration-worker/src/application/outbox-relay.mjs';

// This script creates test triggers as local administrator. It must never run on a shared DB.
if (process.env.PUBLICATION_TEST_CONFIRM !== 'nexo-events-publication-check-only') {
  throw new Error('Requires explicit confirmation of the isolated nexo-events-publication-check project.');
}
const project = 'nexo-events-publication-check';
const dbName = 'nexo_events_publication_test';
const tenant = '0194eb00-0000-7000-8000-000000000001';
const other = '0194eb00-0000-7000-8000-000000000002';
const actor = '0194eb00-0000-7000-9000-000000000001';
const eventId = '0194eb11-1000-7000-8000-000000000001';
const base = 'http://127.0.0.1:13013/configuration/v1';
const docker = (...args) => execFileSync('docker', ['compose', '-p', project, ...args], { encoding: 'utf8' });
const containerDb = docker('exec', '-T', 'api', 'node', '-e', 'process.stdout.write(JSON.stringify({database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD}))');
const credentials = JSON.parse(containerDb);
assert.equal(credentials.database, dbName);
function admin(sql) {
  return execFileSync('docker', ['compose', '-p', project, 'exec', '-T', 'db', 'psql', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'configuration_migrator', '-d', dbName], { input: sql, encoding: 'utf8' }).trim();
}
const { Pool } = createRequire(new URL('../../apps/configuration-api/package.json', import.meta.url))('pg');
const pool = new Pool({ host: '127.0.0.1', port: 15546, database: dbName, user: credentials.user, password: credentials.password, max: 8, options: '-c search_path=events,public' });
after(async () => { await pool.end(); });
const url = `${base}/events/${eventId}/releases`;
async function publish(key, body = { expected_event_revision: 1 }, actorName = 'org-a-manager') {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': actorName, 'if-match': `"${body.expected_event_revision}"`, 'idempotency-key': key }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
function snapshot() {
  const text = admin(`SELECT json_build_object('revision',(SELECT revision_number FROM events.events WHERE id='${eventId}'), 'revisions',(SELECT count(*) FROM events.event_revisions), 'releases',(SELECT count(*) FROM events.releases), 'artifacts',(SELECT count(*) FROM events.release_artifacts), 'outbox',(SELECT count(*) FROM events.outbox), 'audit',(SELECT count(*) FROM events.audit), 'idempotency',(SELECT count(*) FROM events.idempotency_records))::text;`);
  return JSON.parse(text);
}
function installFailure(table) {
  const valid = ['events', 'event_revisions', 'releases', 'release_artifacts', 'outbox', 'audit', 'idempotency_records'];
  if (!valid.includes(table)) throw new Error('Invalid test table');
  const op = table === 'events' ? 'UPDATE' : 'INSERT';
  admin(`CREATE SCHEMA IF NOT EXISTS publication_test; CREATE OR REPLACE FUNCTION publication_test.reject_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected publication failure'; END $$; CREATE TRIGGER publication_test_reject BEFORE ${op} ON events.${table} FOR EACH ROW EXECUTE FUNCTION publication_test.reject_write();`);
}
function removeFailure(table) { admin(`DROP TRIGGER IF EXISTS publication_test_reject ON events.${table};`); }

test('a failure at each publication write rolls back the entire request', async () => {
  const before = snapshot();
  assert.deepEqual(before, { revision: 1, revisions: 1, releases: 0, artifacts: 0, outbox: 0, audit: 1, idempotency: 0 });
  for (const table of ['events', 'event_revisions', 'releases', 'release_artifacts', 'outbox', 'audit', 'idempotency_records']) {
    installFailure(table);
    try {
      const result = await publish(`rollback-${table}-0001`);
      assert.equal(result.status, 500, `injected failure in ${table}`);
      assert.deepEqual(snapshot(), before, `no partial commit after ${table}`);
    } finally { removeFailure(table); }
  }
});

test('two concurrent requests with the same key produce one release and a replay', async () => {
  const key = 'same-request-concurrent-0001';
  const lockKey = `${tenant}:${actor}:release:${key}`;
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [lockKey]);
    const pending = [publish(key), publish(key)];
    let waiting = 0;
    for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
      const text = admin("SELECT count(*) FROM pg_stat_activity WHERE datname='nexo_events_publication_test' AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%';");
      waiting = Number(text);
      if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(waiting >= 2, 'both requests must reach the lock barrier');
    await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey]);
    const [first, second] = await Promise.all(pending);
    assert.deepEqual([first.status, second.status], [201, 201]);
    assert.equal(first.body.id, second.body.id);
    const state = snapshot();
    assert.deepEqual(state, { revision: 2, revisions: 2, releases: 1, artifacts: 3, outbox: 1, audit: 2, idempotency: 1 });
    const conflict = await publish(key, { expected_event_revision: 1, effective_at: '2030-01-01T00:00:00Z' });
    assert.equal(conflict.status, 409);
    const stale = await publish('different-stale-key-0001');
    assert.equal(stale.status, 412);
    const foreign = await publish('other-tenant-0001', { expected_event_revision: 1 }, 'org-b-manager');
    assert.equal(foreign.status, 404);
    assert.deepEqual(snapshot(), state);
  } finally {
    await lock.query('SELECT pg_advisory_unlock_all()');
    lock.release();
  }
});

test('different keys racing on one revision cannot both publish', async () => {
  const lock = await pool.connect();
  try {
    await lock.query('BEGIN');
    await lock.query("SELECT set_config('app.current_organization_id',$1,true)", [tenant]);
    await lock.query('SELECT id FROM events.events WHERE id=$1 FOR UPDATE', [eventId]);
    const pending = [publish('different-race-key-0001', { expected_event_revision: 2 }), publish('different-race-key-0002', { expected_event_revision: 2 })];
    let waiting = 0;
    for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
      waiting = Number(admin("SELECT count(*) FROM pg_stat_activity WHERE datname='nexo_events_publication_test' AND wait_event_type='Lock' AND lower(query) LIKE '%update%events%';"));
      if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(waiting >= 2, 'both writes must be blocked by the held row lock');
    await lock.query('COMMIT');
    const responses = await Promise.all(pending);
    assert.deepEqual(responses.map(item => item.status).sort(), [201, 412]);
    assert.deepEqual(snapshot(), { revision: 3, revisions: 3, releases: 2, artifacts: 6, outbox: 2, audit: 3, idempotency: 2 });
  } finally {
    await lock.query('ROLLBACK');
    lock.release();
  }
});

test('stored artifacts and manifest match their canonical hashes and outbox', () => {
  const require = createRequire(new URL('../../apps/configuration-api/package.json', import.meta.url));
  const { computeSha256 } = require('../../apps/configuration-api/dist/shared/crypto/canonical-json.js');
  const releases = JSON.parse(admin("SELECT json_agg(json_build_object('id',id,'manifest',manifest,'hash',manifest_hash) ORDER BY release_version)::text FROM events.releases;"));
  for (const release of releases) {
    const { manifest_hash, ...unsigned } = release.manifest;
    assert.equal(computeSha256(unsigned), release.hash);
    assert.equal(manifest_hash, release.hash);
    const artifacts = JSON.parse(admin(`SELECT json_agg(json_build_object('kind',kind,'body',body,'sha256',sha256))::text FROM events.release_artifacts WHERE release_id='${release.id}';`));
    for (const artifact of artifacts) {
      assert.equal(computeSha256(artifact.body), artifact.sha256);
      assert.equal(release.manifest.artifacts[artifact.kind].sha256, artifact.sha256);
    }
    const payload = JSON.parse(admin(`SELECT payload::text FROM events.outbox WHERE aggregate_id='${release.id}';`));
    assert.equal(payload.data.manifest_hash, release.hash);
  }
});

test('schedule changes concurrent with publication yield a consistent snapshot', async () => {
  const lock = await pool.connect();
  const program = '0194eb11-5000-7000-8000-000000000001';
  try {
    await lock.query('BEGIN');
    await lock.query("SELECT set_config('app.current_organization_id',$1,true)", [tenant]);
    await lock.query('SELECT id FROM events.events WHERE id=$1 FOR UPDATE', [eventId]);
    const pending = publish('schedule-race-key-0001', { expected_event_revision: 3 });
    let waiting = 0;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      waiting = Number(admin("SELECT count(*) FROM pg_stat_activity WHERE datname='nexo_events_publication_test' AND wait_event_type='Lock' AND lower(query) LIKE '%update%events%';"));
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(waiting, 'publication must reach the event update after reading its snapshot');
    admin(`UPDATE events.programs SET name='Programa modificado' WHERE id='${program}';`);
    await lock.query('COMMIT');
    const response = await pending;
    assert.equal(response.status, 201);
    const artifact = JSON.parse(admin(`SELECT body::text FROM events.release_artifacts WHERE release_id='${response.body.id}' AND kind='schedule';`));
    assert.equal(artifact.programs[0].name, 'Programa principal');
    assert.equal(admin(`SELECT name FROM events.programs WHERE id='${program}';`), 'Programa modificado');
  } finally { await lock.query('ROLLBACK'); lock.release(); }
});

test('two workers respect tenant, live lease, expiration and current ownership', async () => {
  const repository = new OutboxRepository(pool, { batchSize: 1, leaseSeconds: 60 });
  assert.equal((await repository.claimBatch(other, 'other-worker')).length, 0);
  const [one, two] = await Promise.all([repository.claimBatch(tenant, 'worker-one'), repository.claimBatch(tenant, 'worker-two')]);
  assert.equal(one.length + two.length, 2);
  assert.equal(new Set([...one, ...two].map(item => item.id)).size, 2);
  const row = (one.length ? one : two)[0];
  const owner = one.length ? 'worker-one' : 'worker-two';
  const next = one.length ? 'worker-two' : 'worker-one';
  assert.equal(await repository.complete(row, next), false);
  admin(`UPDATE events.outbox SET locked_until=clock_timestamp()-interval '1 second' WHERE id='${row.id}';`);
  assert.equal(await repository.complete(row, owner), false);
  const claimedAgain = await repository.claimBatch(tenant, next);
  assert.equal(claimedAgain.length, 1);
  assert.equal(await repository.fail(row, owner, { attempts: 1, terminal: false, jittered: 1 }, 'expired'), false);
  assert.equal(await repository.complete(claimedAgain[0], next), true);
  assert.equal(admin(`SELECT status FROM events.outbox WHERE id='${row.id}';`), 'delivered');
});


test('PostgreSQL exclusion constraint prevents concurrent overlapping room reservations', async () => {
  const first = await pool.connect();
  const second = await pool.connect();
  const insert = `INSERT INTO events.resource_reservations (organization_id,event_id,session_id,venue_id,reserved_range,created_by)
    VALUES ($1,$2,$3,'0194eb11-4000-7000-8000-000000000002',tstzrange('2030-01-01T10:00Z','2030-01-01T11:00Z','[)'),$4)`;
  try {
    for (const client of [first, second]) {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_organization_id',$1,true)", [tenant]);
    }
    await first.query(insert, [tenant,eventId,'0194eb11-7000-7000-8000-000000000001',actor]);
    const competing = second.query(insert, [tenant,eventId,'0194eb11-7000-7000-8000-000000000002',actor]);
    let waiting = 0;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      waiting = Number(admin("SELECT count(*) FROM pg_stat_activity WHERE datname='nexo_events_publication_test' AND wait_event_type='Lock' AND query LIKE '%resource_reservations%';"));
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(waiting, 'the competing insert must wait for the first transaction');
    await first.query('COMMIT');
    await assert.rejects(competing, { code: '23P01' });
    await second.query('ROLLBACK');
  } finally { await first.query('ROLLBACK'); await second.query('ROLLBACK'); first.release(); second.release(); }
});

test('worker persists retry and terminal failure under a current lease', async () => {
  const repository = new OutboxRepository(pool, { batchSize: 10, leaseSeconds: 60 });
  admin("UPDATE events.outbox SET locked_until=clock_timestamp()-interval '1 second' WHERE status='pending';");
  const [row] = await repository.claimBatch(tenant, 'retry-worker');
  assert.ok(row);
  assert.equal(await repository.fail(row, 'retry-worker', { attempts: 1, terminal: false, jittered: 0 }, 'simulated'), true);
  const [retry] = await repository.claimBatch(tenant, 'retry-worker');
  assert.equal(retry.id, row.id);
  assert.equal(retry.retry_count, 1);
  assert.equal(await repository.fail(retry, 'retry-worker', { attempts: 5, terminal: true, jittered: 0 }, 'simulated'), true);
  assert.equal(admin(`SELECT status FROM events.outbox WHERE id='${row.id}';`), 'failed');
});


test('acceptance before lost lease can lead to a duplicate on recovery', async () => {
  admin(`INSERT INTO events.outbox (organization_id,event_type,aggregate_type,aggregate_id,payload,headers)
    SELECT organization_id,event_type,aggregate_type,aggregate_id,payload,headers FROM events.outbox WHERE status='failed' LIMIT 1;`);
  const repository = new OutboxRepository(pool, { batchSize: 1, leaseSeconds: 60 });
  const [row] = await repository.claimBatch(tenant, 'crashed-worker');
  assert.ok(row);
  let deliveries = 0;
  const events = [];
  const logger = { log: line => events.push(JSON.parse(line).event) };
  const firstBroker = { async publish() {
    deliveries++;
    admin(`UPDATE events.outbox SET locked_until=clock_timestamp()-interval '1 second' WHERE id='${row.id}';`);
    return { accepted: true };
  } };
  await new OutboxRelay(repository, firstBroker, { maxBackoffSeconds: 10 }, 'crashed-worker', logger).process(row);
  assert.deepEqual(events, ['outbox_lease_lost']);
  const [recovered] = await repository.claimBatch(tenant, 'recovery-worker');
  assert.equal(recovered.id, row.id);
  await new OutboxRelay(repository, { async publish() { deliveries++; return { accepted: true }; } }, { maxBackoffSeconds: 10 }, 'recovery-worker', logger).process(recovered);
  assert.equal(deliveries, 2);
  assert.equal(admin(`SELECT status FROM events.outbox WHERE id='${row.id}';`), 'delivered');
});
