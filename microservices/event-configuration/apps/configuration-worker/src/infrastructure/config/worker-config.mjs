export function loadWorkerConfig(env) {
  const config = {
    brokerMode: env.BROKER_MODE,
    tenants: (env.WORKER_TENANT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean),
    pollMs: Number(env.WORKER_POLL_INTERVAL_MS || 1000),
    batchSize: Number(env.WORKER_BATCH_SIZE || 10),
    leaseSeconds: Number(env.WORKER_LEASE_SECONDS || 60),
    maxBackoffSeconds: Number(env.WORKER_MAX_BACKOFF_SECONDS || 300),
    failFirstN: Number(env.SIMULATOR_FAIL_FIRST_N || 0),
    failEveryN: Number(env.SIMULATOR_FAIL_EVERY_N || 0),
  };
  if (!config.tenants.length) throw new Error('WORKER_TENANT_IDS must list authorized tenant UUIDs.');
  for (const tenant of config.tenants) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)) {
      throw new Error(`Invalid tenant UUID in WORKER_TENANT_IDS: ${tenant}`);
    }
  }
  if (config.brokerMode !== 'simulator') throw new Error('BROKER_MODE must select an available publisher adapter.');
  if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') throw new Error('Broker simulator is restricted to development or test.');
  return config;
}

export function loadDatabaseConfig(env) {
  return {
    host: env.POSTGRES_HOST || 'db',
    port: Number(env.POSTGRES_PORT || 5432),
    database: env.POSTGRES_DB || 'event_configuration',
    user: env.POSTGRES_USER || 'configuration_app',
    password: env.POSTGRES_PASSWORD,
    options: '-c search_path=events,public',
    max: 5,
    connectionTimeoutMillis: 5000,
  };
}
