import { randomUUID } from 'node:crypto';

export class SimulatedBroker {
  #attempts = 0;

  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
  }

  async publish(row) {
    this.#attempts += 1;
    if (this.#attempts <= this.config.failFirstN || (this.config.failEveryN > 0 && this.#attempts % this.config.failEveryN === 0)) {
      throw Object.assign(new Error('SIMULATOR_TRANSIENT_FAILURE'), { transient: true });
    }
    this.logger.log(JSON.stringify({
      level: 'info', event: 'simulated_broker_publish',
      outbox_id: row.id, domain_event_id: row.payload?.domain_event_id,
      topic: row.payload?.topic || row.event_type,
      partition_key: row.payload?.partition_key || `${row.organization_id}:${row.aggregate_id}`,
      simulated_attempt: this.#attempts,
    }));
    return { accepted: true, broker_message_id: randomUUID() };
  }
}
