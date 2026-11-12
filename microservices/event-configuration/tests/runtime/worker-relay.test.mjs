import test from 'node:test';
import assert from 'node:assert/strict';
import { OutboxRelay } from '../../apps/configuration-worker/src/application/outbox-relay.mjs';
import { calculateRetry } from '../../apps/configuration-worker/src/domain/retry-policy.mjs';
import { loadWorkerConfig } from '../../apps/configuration-worker/src/infrastructure/config/worker-config.mjs';
import { SimulatedBroker } from '../../apps/configuration-worker/src/infrastructure/messaging/simulated-broker.mjs';
import { OutboxRepository } from '../../apps/configuration-worker/src/infrastructure/persistence/outbox-repository.mjs';

const tenant = '0194eb00-0000-7000-8000-000000000001';
const row = { id: 'outbox-1', organization_id: tenant, aggregate_id: 'event-1', event_type: 'event', payload: {}, retry_count: 0, max_retries: 3 };

test('relay schedules a retry after a simulated failure and completes the next attempt', async () => {
  const events = [];
  const calls = [];
  const logger = { log: (line) => events.push(JSON.parse(line)) };
  const repository = {
    complete: async (...args) => { calls.push(['complete', ...args]); return true; },
    fail: async (...args) => { calls.push(['fail', ...args]); return true; },
  };
  const config = { failFirstN: 1, failEveryN: 0, maxBackoffSeconds: 300 };
  const relay = new OutboxRelay(repository, new SimulatedBroker(config, logger), config, 'worker-1', logger);

  await relay.process(row);
  await relay.process({ ...row, retry_count: 1 });

  assert.deepEqual(calls.map((call) => call[0]), ['fail', 'complete']);
  assert.equal(calls[0][3].attempts, 1);
  assert.deepEqual(events.map((event) => event.event), ['outbox_retry_scheduled', 'simulated_broker_publish', 'outbox_delivered']);
});

test('retry policy applies the configured limit and marks exhausted attempts', () => {
  assert.deepEqual(calculateRetry({ retry_count: 2, max_retries: 3 }, 4, () => 0.5), {
    attempts: 3, terminal: true, jittered: 4,
  });
});

test('outbox repository scopes reads to the tenant and commits the claim', async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql, values) {
      queries.push({ sql: String(sql).trim(), values });
      if (String(sql).includes('SELECT id')) return { rowCount: 1, rows: [{ id: 'outbox-1' }] };
      if (String(sql).includes('RETURNING')) return { rowCount: 1, rows: [row] };
      return { rowCount: 0, rows: [] };
    },
    release() { released = true; },
  };
  const repository = new OutboxRepository({ connect: async () => client }, { batchSize: 10, leaseSeconds: 60 });

  const claimed = await repository.claimBatch(tenant, 'worker-1');

  assert.deepEqual(claimed, [row]);
  assert.equal(queries[0].sql, 'BEGIN');
  assert.deepEqual(queries[1].values, [tenant]);
  assert.equal(queries.at(-1).sql, 'COMMIT');
  assert.equal(released, true);
});

test('worker configuration rejects missing tenants', () => {
  assert.throws(() => loadWorkerConfig({}), /WORKER_TENANT_IDS/);
  assert.deepEqual(loadWorkerConfig({ WORKER_TENANT_IDS: tenant, BROKER_MODE: 'simulator', NODE_ENV: 'test' }).tenants, [tenant]);
});


test('relay does not mark a rejected or missing broker confirmation as delivered', async () => {
  for (const confirmation of [{ accepted: false }, undefined, {}]) {
    const calls = [];
    const repository = { complete: async () => calls.push('complete'), fail: async () => calls.push('fail') };
    const relay = new OutboxRelay(repository, { publish: async () => confirmation }, { maxBackoffSeconds: 10 }, 'worker', { log() {} });
    await relay.process(row);
    assert.deepEqual(calls, ['fail']);
  }
});

test('broker selection rejects missing, unknown and production simulators', () => {
  const base = { WORKER_TENANT_IDS: tenant, NODE_ENV: 'test' };
  assert.throws(() => loadWorkerConfig(base), /BROKER_MODE/);
  assert.throws(() => loadWorkerConfig({ ...base, BROKER_MODE: 'unknown' }), /BROKER_MODE/);
  assert.throws(() => loadWorkerConfig({ ...base, BROKER_MODE: 'simulator', NODE_ENV: 'production' }), /restricted/);
});

test('lost lease is reported without claiming delivery or retry', async () => {
  for (const accepted of [true, false]) {
    const events = [];
    const relay = new OutboxRelay({ complete: async () => false, fail: async () => false },
      { publish: async () => ({ accepted }) }, { maxBackoffSeconds: 10 }, 'worker', { log: line => events.push(JSON.parse(line)) });
    await relay.process(row);
    assert.deepEqual(events.map(event => event.event), ['outbox_lease_lost']);
  }
});

test('an uncertain database completion error does not become a broker retry', async () => {
  let failed = false;
  const relay = new OutboxRelay({ complete: async () => { throw new Error('database unavailable'); }, fail: async () => { failed = true; } },
    { publish: async () => ({ accepted: true }) }, {}, 'worker', { log() {} });
  await assert.rejects(relay.process(row), /database unavailable/);
  assert.equal(failed, false);
});

test('relay updates heartbeat during polling cycle', async () => {
  let heartbeats = 0;
  let relay;
  const repository = {
    claimBatch: async () => {
      relay.stop();
      return [];
    },
  };
  relay = new OutboxRelay(
    repository,
    { publish: async () => ({ accepted: true }) },
    { tenants: [tenant], pollMs: 1, brokerMode: 'simulator' },
    'worker-hb',
    { log() {} },
    async () => { heartbeats += 1; },
  );
  await relay.run();
  assert.ok(heartbeats >= 1);
});
