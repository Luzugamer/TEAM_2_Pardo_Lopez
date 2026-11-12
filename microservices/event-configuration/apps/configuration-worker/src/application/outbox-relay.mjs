import { setTimeout as delay } from 'node:timers/promises';
import { calculateRetry } from '../domain/retry-policy.mjs';

/**
 * @typedef {{ accepted: boolean, broker_message_id?: string }} PublishConfirmation
 * @typedef {{ publish: (row: object) => Promise<PublishConfirmation> }} MessagePublisher
 * A publisher must explicitly confirm acceptance before an outbox row can be completed.
 */
export class OutboxRelay {
  constructor(repository, broker, config, workerId, logger = console, onHeartbeat = null) {
    this.repository = repository;
    this.broker = broker;
    this.config = config;
    this.workerId = workerId;
    this.logger = logger;
    this.onHeartbeat = onHeartbeat;
    this.stopping = false;
  }

  stop() {
    this.stopping = true;
  }

  async process(row) {
    let confirmation;
    try {
      confirmation = await this.broker.publish(row);
      if (confirmation?.accepted !== true) throw new Error('BROKER_CONFIRMATION_MISSING');
    } catch (error) {
      const retry = calculateRetry(row, this.config.maxBackoffSeconds);
      const message = String(error.message || 'BROKER_FAILURE');
      const updated = await this.repository.fail(row, this.workerId, retry, message);
      if (!updated) {
        this.logger.log(JSON.stringify({ level: 'warn', event: 'outbox_lease_lost', outbox_id: row.id }));
        return;
      }
      this.logger.log(JSON.stringify({
        level: retry.terminal ? 'error' : 'warn', event: retry.terminal ? 'outbox_failed' : 'outbox_retry_scheduled',
        outbox_id: row.id, attempts: retry.attempts, retry_in_seconds: retry.terminal ? null : retry.jittered,
        error: message.slice(0, 200),
      }));
      return;
    }
    // A database error here has an uncertain outcome; do not misclassify it as a broker failure.
    const completed = await this.repository.complete(row, this.workerId);
    this.logger.log(JSON.stringify({
      level: completed ? 'info' : 'warn', event: completed ? 'outbox_delivered' : 'outbox_lease_lost',
      outbox_id: row.id, broker_confirmation: confirmation.accepted,
    }));
  }

  async run() {
    this.logger.log(JSON.stringify({ level: 'info', event: 'worker_started', worker_id: this.workerId, tenants: this.config.tenants.length, broker: this.config.brokerMode }));
    while (!this.stopping) {
      if (this.onHeartbeat) await this.onHeartbeat();
      let found = false;
      for (const tenant of this.config.tenants) {
        if (this.stopping) break;
        const batch = await this.repository.claimBatch(tenant, this.workerId);
        found ||= batch.length > 0;
        for (const row of batch) {
          if (this.stopping) break;
          await this.process(row);
        }
      }
      if (this.onHeartbeat) await this.onHeartbeat();
      if (!found) await delay(this.config.pollMs);
    }
  }
}
