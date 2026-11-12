import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { DatabaseSchema } from './types';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;
  private db!: Kysely<DatabaseSchema>;
  private isConnected = false;
  private readonly transactionContext = new AsyncLocalStorage<{ organizationId: string; trx: Kysely<DatabaseSchema> }>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const connectionString =
      this.configService.get<string>('DATABASE_URL') ||
      `postgresql://${this.configService.get<string>('POSTGRES_USER', 'postgres')}:${this.configService.get<string>('POSTGRES_PASSWORD', 'postgres')}@${this.configService.get<string>('POSTGRES_HOST', 'localhost')}:${this.configService.get<number>('POSTGRES_PORT', 5432)}/${this.configService.get<string>('POSTGRES_DB', 'event_configuration')}`;

    this.pool = new Pool({
      connectionString,
      options: '-c search_path=events,public',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    const dialect = new PostgresDialect({
      pool: this.pool,
    });

    this.db = new Kysely<DatabaseSchema>({
      dialect,
    }).withSchema('events');

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(`SELECT current_schema() AS schema, r.rolsuper, r.rolbypassrls,
          pg_has_role(current_user, c.relowner, 'MEMBER') AS owns_events
          FROM pg_roles r JOIN pg_class c ON c.oid = to_regclass('events.events')
          WHERE r.rolname = current_user`);
        const role = result.rows[0];
        if (!role || role.schema !== 'events' || role.rolsuper || role.rolbypassrls || role.owns_events) {
          throw new Error('Invalid events schema or privileged runtime role.');
        }
      } finally { client.release(); }
      this.isConnected = true;
      this.logger.log('PostgreSQL connection pool initialized successfully.');
    } catch (err) {
      await this.db.destroy();
      throw new Error(`PostgreSQL is required for the API: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.db) {
      await this.db.destroy();
    } else if (this.pool) {
      await this.pool.end();
    }
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Executes a callback within a transactional context enforcing Row Level Security (RLS)
   * for the given organization_id via PostgreSQL `app.current_organization_id`.
   */
  async withTenantTransaction<T>(
    organizationId: string,
    callback: (trx: Kysely<DatabaseSchema>) => Promise<T>,
    isolationLevel: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' = 'READ COMMITTED',
  ): Promise<T> {
    const active = this.transactionContext.getStore();
    if (active) {
      if (active.organizationId !== organizationId) throw new Error('Cross-tenant transaction reuse denied.');
      return callback(active.trx);
    }
    return await this.db.transaction().execute(async (trx) => {
      if (isolationLevel !== 'READ COMMITTED') {
        await sql.raw(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`).execute(trx);
      }
      // Set RLS variable for this transaction
      await sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`.execute(trx);
      return await this.transactionContext.run({ organizationId, trx }, () => callback(trx));
    });
  }

  /**
   * Executes a callback in a SERIALIZABLE transaction under RLS with automatic retries on serialization failures (SQLSTATE 40001 / 40P01).
   */
  async withSerializableTransaction<T>(
    organizationId: string,
    callback: (trx: Kysely<DatabaseSchema>) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    const active = this.transactionContext.getStore();
    if (active) {
      if (active.organizationId !== organizationId) throw new Error('Cross-tenant transaction reuse denied.');
      // A nested transaction cannot recover after PostgreSQL aborts its outer
      // transaction. Let the outermost owner perform the retry.
      return callback(active.trx);
    }
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        return await this.withTenantTransaction(
          organizationId,
          callback,
          'SERIALIZABLE',
        );
      } catch (error: any) {
        const isSerializationError = error?.code === '40001' || error?.code === '40P01'
          || (error?.code === '23505' && ['uq_idempotency_actor_operation_key', 'uq_form_version_number'].includes(error?.constraint));

        if (isSerializationError && attempt < maxRetries) {
          this.logger.warn(
            `Serialization failure on attempt ${attempt}/${maxRetries} for tenant ${organizationId}. Retrying with backoff...`,
          );
          const delay = Math.pow(2, attempt) * 40 + Math.floor(Math.random() * 30);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Failed to complete serializable transaction after ${maxRetries} retries.`);
  }
}

