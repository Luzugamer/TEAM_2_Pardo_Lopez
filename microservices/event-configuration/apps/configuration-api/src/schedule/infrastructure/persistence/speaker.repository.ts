import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database/database.service';
import { generateUuidV7 } from '../../../shared/crypto/uuidv7';
import { AuditContext } from '../../domain/ports/schedule-repository.port';
import { SpeakerEntity, SpeakerPatch, SpeakerRepositoryPort, SpeakerWrite } from '../../domain/ports/speaker-repository.port';
import { decodeCursor, encodeCursor } from './schedule.pagination';

@Injectable()
export class SpeakerRepository implements SpeakerRepositoryPort {
  constructor(private readonly database: DatabaseService) {}

  async list(organizationId: string, limit: number, cursor?: string) {
    return this.database.withTenantTransaction(organizationId, async (db) => {
      let query = db.selectFrom('speakers').selectAll()
        .where('organization_id', '=', organizationId).where('archived_at', 'is', null);
      const values = decodeCursor(cursor, 'speakers');
      if (values) {
        const [name, id] = values as [string, string];
        query = query.where((eb) => eb.or([
          eb('display_name', '>', name), eb.and([eb('display_name', '=', name), eb('id', '>', id)]),
        ]));
      }
      const rows = await query.orderBy('display_name').orderBy('id').limit(limit + 1).execute();
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((row) => this.toEntity(row)),
        next_cursor: rows.length > limit && last ? encodeCursor('speakers', [last.display_name, last.id]) : null,
      };
    });
  }

  async findActive(organizationId: string, id: string): Promise<SpeakerEntity | null> {
    return this.database.withTenantTransaction(organizationId, async (db) => {
      const row = await db.selectFrom('speakers').selectAll().where('organization_id', '=', organizationId)
        .where('id', '=', id).where('archived_at', 'is', null).executeTakeFirst();
      return row ? this.toEntity(row) : null;
    });
  }

  async hasActiveReservation(organizationId: string, id: string): Promise<boolean> {
    return this.database.withTenantTransaction(organizationId, async (db) => Boolean(await db
      .selectFrom('resource_reservations').select('id').where('organization_id', '=', organizationId)
      .where('speaker_id', '=', id).where('released_at', 'is', null).executeTakeFirst()));
  }

  async insert(organizationId: string, actorId: string, input: SpeakerWrite, consentVersion: string | null): Promise<SpeakerEntity> {
    return this.database.withTenantTransaction(organizationId, async (db) => {
      const now = new Date();
      const row = await db.insertInto('speakers').values({
        id: generateUuidV7(), organization_id: organizationId, display_name: input.display_name.trim(),
        bio: input.bio ?? null, media_ref: input.media_ref ?? null, public_consent: input.public_consent,
        public_consent_at: input.public_consent ? now : null, public_consent_version: consentVersion,
        exclusive: input.exclusive ?? false, archived_at: null, revision: 1,
        created_at: now, updated_at: now, created_by: actorId, updated_by: actorId,
      }).returningAll().executeTakeFirstOrThrow();
      return this.toEntity(row);
    });
  }

  async update(organizationId: string, actorId: string, id: string, revision: number, input: SpeakerPatch, consentVersion: string | null | undefined): Promise<SpeakerEntity | null> {
    return this.database.withTenantTransaction(organizationId, async (db) => {
      const now = new Date();
      const row = await db.updateTable('speakers').set({
        ...(input.display_name !== undefined ? { display_name: input.display_name.trim() } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.media_ref !== undefined ? { media_ref: input.media_ref } : {}),
        ...(input.exclusive !== undefined ? { exclusive: input.exclusive } : {}),
        ...(input.public_consent !== undefined ? {
          public_consent: input.public_consent,
          public_consent_at: input.public_consent ? now : null,
          public_consent_version: consentVersion ?? null,
        } : {}),
        revision: revision + 1, updated_at: now, updated_by: actorId,
      }).where('organization_id', '=', organizationId).where('id', '=', id).where('revision', '=', revision)
        .returningAll().executeTakeFirst();
      return row ? this.toEntity(row) : null;
    });
  }

  async archive(organizationId: string, actorId: string, id: string, revision: number): Promise<boolean> {
    return this.database.withTenantTransaction(organizationId, async (db) => Boolean(await db.updateTable('speakers')
      .set({ archived_at: new Date(), updated_at: new Date(), updated_by: actorId, revision: revision + 1 })
      .where('organization_id', '=', organizationId).where('id', '=', id).where('revision', '=', revision)
      .where('archived_at', 'is', null).returning('id').executeTakeFirst()));
  }

  async appendAudit(organizationId: string, actor: AuditContext, id: string, action: string, revision: number, diff: Record<string, unknown>): Promise<void> {
    await this.database.withTenantTransaction(organizationId, async (db) => {
      await db.insertInto('audit').values({
        organization_id: organizationId, entity_type: 'speaker', entity_id: id, action,
        actor_id: actor.actorId, actor_roles: actor.actorRoles, request_id: actor.requestId ?? null,
        idempotency_key: null, revision_number: revision, diff, payload_hash: null,
        client_ip: actor.clientIp ?? null, user_agent: actor.userAgent ?? null,
      }).execute();
    });
  }

  async appendConsent(organizationId: string, actorId: string, speakerId: string, accepted: boolean, version: string): Promise<void> {
    await this.database.withTenantTransaction(organizationId, async (db) => {
      await db.insertInto('speaker_consent_history').values({
        id: generateUuidV7(), organization_id: organizationId, speaker_id: speakerId,
        consent: accepted, notice_version: version, actor_id: actorId, occurred_at: new Date(),
      }).execute();
    });
  }

  private toEntity(row: Record<string, unknown>): SpeakerEntity {
    return {
      id: String(row.id), organization_id: String(row.organization_id), display_name: String(row.display_name),
      bio: row.bio === null ? null : String(row.bio), media_ref: row.media_ref === null ? null : String(row.media_ref),
      public_consent: Boolean(row.public_consent),
      public_consent_at: row.public_consent_at ? new Date(row.public_consent_at as Date).toISOString() : null,
      public_consent_version: row.public_consent_version ? String(row.public_consent_version) : null,
      exclusive: Boolean(row.exclusive), archived_at: row.archived_at ? new Date(row.archived_at as Date).toISOString() : null,
      revision: Number(row.revision), created_at: new Date(row.created_at as Date).toISOString(),
      updated_at: new Date(row.updated_at as Date).toISOString(),
    };
  }
}
