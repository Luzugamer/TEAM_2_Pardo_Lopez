export class OutboxRepository {
  constructor(pool, config) {
    this.pool = pool;
    this.config = config;
  }

  async claimBatch(tenantId, workerId) {
    return this.withTenantTransaction(tenantId, async (client) => {
      const selected = await client.query(`
        SELECT id
        FROM events.outbox
        WHERE organization_id = $1
          AND status = 'pending'
          AND next_retry_at <= clock_timestamp()
          AND (locked_until IS NULL OR locked_until < clock_timestamp())
        ORDER BY next_retry_at, created_at, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `, [tenantId, this.config.batchSize]);
      if (!selected.rowCount) return [];
      const ids = selected.rows.map((row) => row.id);
      const claimed = await client.query(`
        UPDATE events.outbox
        SET locked_by = $2, locked_until = clock_timestamp() + ($3 * interval '1 second')
        WHERE organization_id = $1 AND id = ANY($4::uuid[])
        RETURNING id, organization_id, event_type, aggregate_id, payload, headers, retry_count, max_retries
      `, [tenantId, workerId, this.config.leaseSeconds, ids]);
      return claimed.rows;
    });
  }

  async complete(row, workerId) {
    const result = await this.withTenantTransaction(row.organization_id, (client) => client.query(`
      UPDATE events.outbox
      SET status = 'delivered', delivered_at = clock_timestamp(), last_error = NULL,
          locked_by = NULL, locked_until = NULL
      WHERE organization_id = $1 AND id = $2 AND locked_by = $3
        AND status = 'pending' AND locked_until > clock_timestamp()
    `, [row.organization_id, row.id, workerId]));
    return result.rowCount === 1;
  }

  async fail(row, workerId, retry, errorMessage) {
    const result = await this.withTenantTransaction(row.organization_id, (client) => client.query(`
      UPDATE events.outbox
      SET retry_count = $4, status = $5::varchar,
          next_retry_at = CASE WHEN $5::varchar = 'pending' THEN clock_timestamp() + ($6 * interval '1 second') ELSE next_retry_at END,
          last_error = $7, locked_by = NULL, locked_until = NULL
      WHERE organization_id = $1 AND id = $2 AND locked_by = $3
        AND status = 'pending' AND locked_until > clock_timestamp()
    `, [row.organization_id, row.id, workerId, retry.attempts, retry.terminal ? 'failed' : 'pending', retry.jittered, errorMessage.slice(0, 500)]));
    return result.rowCount === 1;
  }

  async withTenantTransaction(tenantId, action) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_organization_id', $1, true)", [tenantId]);
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
