import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { DatabaseService } from '../../../shared/database/database.service';
import { DatabaseSchema } from '../../../shared/database/types';
import { ProblemDetailsException } from '../../../shared/errors/problem-details.exception';
import { computeSha256 } from '../../../shared/crypto/canonical-json';
import { generateUuidV7 } from '../../../shared/crypto/uuidv7';
import { decodeCursor, encodeCursor } from './schedule.pagination';
import { ProgramEntity, SessionEntity, VenueEntity, VenueLocation } from '../../domain/models/schedule.entity';
import { AuditContext, ListPage, ProgramPatch, ProgramWrite, ScheduleRepositoryPort, SessionWrite, VenuePatch, VenueWrite } from '../../domain/ports/schedule-repository.port';

@Injectable()
export class ScheduleRepository implements ScheduleRepositoryPort {
  constructor(private readonly databaseService: DatabaseService) {}

  async listVenues(organizationId: string, limit: number, cursor?: string): Promise<ListPage<VenueEntity>> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      let query = db.selectFrom('venues').selectAll()
        .where('organization_id', '=', organizationId)
        .where('archived_at', 'is', null);
      const values = decodeCursor(cursor, 'venues');
      if (values) {
        const [name, id] = values as [string, string];
        query = query.where((eb) => eb.or([
          eb('name', '>', name),
          eb.and([eb('name', '=', name), eb('id', '>', id)]),
        ]));
      }
      const rows = await query.orderBy('name', 'asc').orderBy('id', 'asc').limit(limit + 1).execute();
      const hasNext = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      return {
        items: pageRows.map((row) => this.toVenue(row)),
        next_cursor: hasNext && last ? encodeCursor('venues', [last.name, last.id]) : null,
      };
    });
  }

  async createVenue(
    organizationId: string,
    actor: AuditContext,
    dto: VenueWrite,
  ): Promise<VenueEntity> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const now = new Date();
      const row = await db.insertInto('venues').values({
        id: generateUuidV7(),
        organization_id: organizationId,
        kind: dto.kind,
        parent_venue_id: dto.parent_venue_id ?? null,
        name: dto.name.trim(),
        location: dto.location as unknown as Record<string, unknown>,
        capacity: dto.capacity ?? null,
        exclusive: dto.exclusive,
        accessibility: sql<string[]>`${JSON.stringify(dto.accessibility ?? [])}::jsonb`,
        archived_at: null,
        revision: 1,
        created_at: now,
        updated_at: now,
        created_by: actor.actorId,
        updated_by: actor.actorId,
      }).returningAll().executeTakeFirstOrThrow();

      const entity = this.toVenue(row);
      await this.insertAudit(db, organizationId, 'venue', entity.id, 'created', 1, {
        kind: entity.kind,
        name: entity.name,
      }, actor);
      return entity;
    });
  }

  async findActiveVenue(organizationId: string, venueId: string): Promise<VenueEntity | null> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const row = await db.selectFrom('venues').selectAll()
        .where('organization_id', '=', organizationId)
        .where('id', '=', venueId)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      return row ? this.toVenue(row) : null;
    });
  }

  async updateVenue(organizationId: string, id: string, revision: number, actor: AuditContext, dto: VenuePatch): Promise<VenueEntity> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      if (dto.exclusive === false) {
        const reservation = await db.selectFrom('resource_reservations').select('id').where('organization_id', '=', organizationId)
          .where('venue_id', '=', id).where('released_at', 'is', null).executeTakeFirst();
        if (reservation) throw ProblemDetailsException.conflict('Venue has active reservations.', 'resource_in_use');
      }
      const values = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
      const row = await db.updateTable('venues').set({ ...values, ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.accessibility !== undefined ? { accessibility: sql<string[]>`${JSON.stringify(dto.accessibility)}::jsonb` } : {}),
        revision: revision + 1, updated_at: new Date(), updated_by: actor.actorId })
        .where('organization_id', '=', organizationId).where('id', '=', id).where('revision', '=', revision)
        .where('archived_at', 'is', null).returningAll().executeTakeFirst();
      if (!row) throw ProblemDetailsException.preconditionFailed('Venue revision is stale or venue is unavailable.');
      const entity = this.toVenue(row);
      await this.insertAudit(db, organizationId, 'venue', id, 'updated', entity.revision, { fields: Object.keys(dto) }, actor);
      return entity;
    });
  }

  async archiveVenue(organizationId: string, id: string, revision: number, actor: AuditContext): Promise<void> {
    await this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const reserved = await db.selectFrom('resource_reservations').select('id').where('organization_id', '=', organizationId)
        .where('venue_id', '=', id).where('released_at', 'is', null).executeTakeFirst();
      if (reserved) throw ProblemDetailsException.conflict('Venue has active reservations.', 'resource_in_use');
      const updated = await db.updateTable('venues').set({ archived_at: new Date(), revision: revision + 1, updated_at: new Date(), updated_by: actor.actorId })
        .where('organization_id', '=', organizationId).where('id', '=', id).where('revision', '=', revision).where('archived_at', 'is', null)
        .returning('id').executeTakeFirst();
      if (!updated) throw ProblemDetailsException.preconditionFailed('Venue revision is stale or venue is unavailable.');
      await this.insertAudit(db, organizationId, 'venue', id, 'archived', revision + 1, {}, actor);
    });
  }

  async findVenueParent(organizationId: string, venueId: string): Promise<VenueEntity | null> {
    return this.findActiveVenue(organizationId, venueId);
  }

  async listPrograms(
    organizationId: string,
    eventId: string,
    limit: number,
    cursor?: string,
  ): Promise<ListPage<ProgramEntity>> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      let query = db.selectFrom('programs').selectAll()
        .where('organization_id', '=', organizationId)
        .where('event_id', '=', eventId)
        .where('archived_at', 'is', null);
      const values = decodeCursor(cursor, 'programs');
      if (values) {
        const [displayOrder, id] = values as [number, string];
        query = query.where((eb) => eb.or([
          eb('display_order', '>', displayOrder),
          eb.and([eb('display_order', '=', displayOrder), eb('id', '>', id)]),
        ]));
      }
      const rows = await query.orderBy('display_order', 'asc').orderBy('id', 'asc').limit(limit + 1).execute();
      const hasNext = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      return {
        items: pageRows.map((row) => this.toProgram(row)),
        next_cursor: hasNext && last ? encodeCursor('programs', [last.display_order, last.id]) : null,
      };
    });
  }

  async createProgram(
    organizationId: string,
    eventId: string,
    actor: AuditContext,
    dto: ProgramWrite,
  ): Promise<ProgramEntity> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const now = new Date();
      const row = await db.insertInto('programs').values({
        id: generateUuidV7(),
        organization_id: organizationId,
        event_id: eventId,
        slug: dto.slug,
        name: dto.name.trim(),
        description: dto.description ?? null,
        display_order: dto.display_order,
        color: dto.color ?? null,
        archived_at: null,
        revision: 1,
        created_at: now,
        updated_at: now,
        created_by: actor.actorId,
        updated_by: actor.actorId,
      }).returningAll().executeTakeFirstOrThrow();

      const entity = this.toProgram(row);
      await this.insertAudit(db, organizationId, 'program', entity.id, 'created', 1, {
        event_id: eventId,
        slug: entity.slug,
      }, actor);
      return entity;
    });
  }

  async findActiveProgram(organizationId: string, eventId: string, programId: string): Promise<ProgramEntity | null> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const row = await db.selectFrom('programs').selectAll()
        .where('organization_id', '=', organizationId)
        .where('event_id', '=', eventId)
        .where('id', '=', programId)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      return row ? this.toProgram(row) : null;
    });
  }

  async updateProgram(organizationId: string, eventId: string, id: string, revision: number, actor: AuditContext, dto: ProgramPatch): Promise<ProgramEntity> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const values = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
      const row = await db.updateTable('programs').set({ ...values, ...(dto.name ? { name: dto.name.trim() } : {}),
        revision: revision + 1, updated_at: new Date(), updated_by: actor.actorId })
        .where('organization_id', '=', organizationId).where('event_id', '=', eventId).where('id', '=', id)
        .where('revision', '=', revision).where('archived_at', 'is', null).returningAll().executeTakeFirst();
      if (!row) throw ProblemDetailsException.preconditionFailed('Program revision is stale or program is unavailable.');
      const entity = this.toProgram(row);
      await this.insertAudit(db, organizationId, 'program', id, 'updated', entity.revision, { fields: Object.keys(dto) }, actor);
      return entity;
    });
  }

  async archiveProgram(organizationId: string, eventId: string, id: string, revision: number, actor: AuditContext): Promise<void> {
    await this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const active = await db.selectFrom('sessions').select('id').where('organization_id', '=', organizationId)
        .where('event_id', '=', eventId).where('program_id', '=', id).where('status', 'in', ['draft', 'scheduled']).executeTakeFirst();
      if (active) throw ProblemDetailsException.conflict('Program is referenced by active sessions.', 'resource_in_use');
      const row = await db.updateTable('programs').set({ archived_at: new Date(), revision: revision + 1, updated_at: new Date(), updated_by: actor.actorId })
        .where('organization_id', '=', organizationId).where('event_id', '=', eventId).where('id', '=', id)
        .where('revision', '=', revision).where('archived_at', 'is', null).returning('id').executeTakeFirst();
      if (!row) throw ProblemDetailsException.preconditionFailed('Program revision is stale or program is unavailable.');
      await this.insertAudit(db, organizationId, 'program', id, 'archived', revision + 1, {}, actor);
    });
  }

  async findActiveSpeakers(organizationId: string, speakerIds: string[]): Promise<Array<{ id: string; exclusive: boolean }>> {
    if (speakerIds.length === 0) return [];
    return this.databaseService.withTenantTransaction(organizationId, async (db) =>
      (await db.selectFrom('speakers').select(['id', 'exclusive'])
        .where('organization_id', '=', organizationId).where('archived_at', 'is', null)
        .where('id', 'in', speakerIds).execute()).map((row) => ({ id: row.id, exclusive: row.exclusive })),
    );
  }

  async getValidationResources(organizationId: string, eventId: string, programIds: string[], venueIds: string[], speakerIds: string[]) {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const [programs, venues, speakers, reservations] = await Promise.all([
        programIds.length ? db.selectFrom('programs').select('id').where('organization_id', '=', organizationId)
          .where('event_id', '=', eventId).where('archived_at', 'is', null).where('id', 'in', programIds).execute() : [],
        venueIds.length ? db.selectFrom('venues').select(['id', 'exclusive']).where('organization_id', '=', organizationId)
          .where('archived_at', 'is', null).where('id', 'in', venueIds).execute() : [],
        speakerIds.length ? db.selectFrom('speakers').select(['id', 'exclusive']).where('organization_id', '=', organizationId)
          .where('archived_at', 'is', null).where('id', 'in', speakerIds).execute() : [],
        db.selectFrom('resource_reservations as r').innerJoin('sessions as s', (join) => join
          .onRef('s.organization_id', '=', 'r.organization_id').onRef('s.event_id', '=', 'r.event_id').onRef('s.id', '=', 'r.session_id'))
          .select(['s.id as session_id', 's.starts_at', 's.ends_at', 'r.venue_id', 'r.speaker_id'])
          .where('r.organization_id', '=', organizationId).where('r.event_id', '=', eventId)
          .where('r.released_at', 'is', null).where('s.status', '=', 'scheduled').execute(),
      ]);
      return {
        programIds: new Set(programs.map((row) => row.id)),
        venues: new Map(venues.map((row) => [row.id, row.exclusive])),
        speakers: new Map(speakers.map((row) => [row.id, row.exclusive])),
        reservations: reservations.map((row) => ({
          session_id: row.session_id,
          resource_type: row.speaker_id ? 'speaker' as const : 'venue' as const,
          resource_id: row.speaker_id ?? row.venue_id!,
          starts_at: row.starts_at.toISOString(),
          ends_at: row.ends_at.toISOString(),
        })),
      };
    });
  }

  async listSessions(
    organizationId: string,
    eventId: string,
    limit: number,
    cursor?: string,
    filters: { program_id?: string; venue_id?: string; starts_after?: Date; ends_before?: Date } = {},
  ): Promise<ListPage<SessionEntity>> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      let query = db.selectFrom('sessions')
        .innerJoin('programs', (join) => join
          .onRef('programs.organization_id', '=', 'sessions.organization_id')
          .onRef('programs.event_id', '=', 'sessions.event_id')
          .onRef('programs.id', '=', 'sessions.program_id'))
        .selectAll('sessions')
        .select('programs.display_order as program_display_order')
        .where('sessions.organization_id', '=', organizationId)
        .where('sessions.event_id', '=', eventId);
      if (filters.program_id) query = query.where('sessions.program_id', '=', filters.program_id);
      if (filters.venue_id) query = query.where('sessions.venue_id', '=', filters.venue_id);
      if (filters.starts_after) query = query.where('sessions.starts_at', '>=', filters.starts_after);
      if (filters.ends_before) query = query.where('sessions.ends_at', '<=', filters.ends_before);
      const values = decodeCursor(cursor, 'sessions');
      if (values) {
        const [startsAt, programOrder, id] = values as [string, number, string];
        const startsAtDate = new Date(startsAt);
        query = query.where((eb) => eb.or([
          eb('sessions.starts_at', '>', startsAtDate),
          eb.and([
            eb('sessions.starts_at', '=', startsAtDate),
            eb('programs.display_order', '>', programOrder),
          ]),
          eb.and([
            eb('sessions.starts_at', '=', startsAtDate),
            eb('programs.display_order', '=', programOrder),
            eb('sessions.id', '>', id),
          ]),
        ]));
      }
      const rows = await query
        .orderBy('sessions.starts_at', 'asc')
        .orderBy('programs.display_order', 'asc')
        .orderBy('sessions.id', 'asc')
        .limit(limit + 1)
        .execute();
      const hasNext = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      return {
        items: pageRows.map((row) => this.toSession(row)),
        next_cursor: hasNext && last
          ? encodeCursor('sessions', [last.starts_at.toISOString(), last.program_display_order, last.id])
          : null,
      };
    });
  }

  async createDraftSession(
    organizationId: string,
    eventId: string,
    actor: AuditContext,
    dto: SessionWrite,
    timezone: string,
  ): Promise<SessionEntity> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const now = new Date();
      const row = await db.insertInto('sessions').values({
        id: generateUuidV7(),
        organization_id: organizationId,
        event_id: eventId,
        program_id: dto.program_id,
        venue_id: dto.venue_id,
        title: dto.title.trim(),
        description: dto.description ?? null,
        starts_at: new Date(dto.starts_at),
        ends_at: new Date(dto.ends_at),
        status: 'draft',
        status_reason: null,
        revision: 1,
        created_at: now,
        updated_at: now,
        created_by: actor.actorId,
        updated_by: actor.actorId,
      }).returningAll().executeTakeFirstOrThrow();

      const entity = this.toSession(row, timezone);
      const speakerIds = [...new Set(dto.speaker_ids ?? [])];
      if (speakerIds.length) {
        await db.insertInto('session_speakers').values(speakerIds.map((speakerId, display_order) => ({
          id: generateUuidV7(), organization_id: organizationId, event_id: eventId,
          session_id: entity.id, speaker_id: speakerId, display_order,
          created_at: now, created_by: actor.actorId,
        }))).execute();
      }
      await this.insertAudit(db, organizationId, 'session', entity.id, 'created_draft', 1, {
        event_id: eventId,
        program_id: entity.program_id,
        venue_id: entity.venue_id,
        starts_at: entity.starts_at,
        ends_at: entity.ends_at,
      }, actor);
      return { ...entity, speaker_ids: speakerIds };
    });
  }

  async findSession(organizationId: string, eventId: string, sessionId: string): Promise<SessionEntity | null> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const row = await db.selectFrom('sessions').selectAll()
        .where('organization_id', '=', organizationId)
        .where('event_id', '=', eventId)
        .where('id', '=', sessionId)
        .executeTakeFirst();
      return row ? this.toSession(row) : null;
    });
  }

  async markSessionScheduled(
    organizationId: string,
    eventId: string,
    sessionId: string,
    expectedRevision: number,
    actor: AuditContext,
    timezone: string,
  ): Promise<SessionEntity | null> {
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const row = await db.updateTable('sessions')
        .set((eb) => ({
          status: 'scheduled',
          revision: eb('revision', '+', 1),
          updated_at: new Date(),
          updated_by: actor.actorId,
        }))
        .where('organization_id', '=', organizationId)
        .where('event_id', '=', eventId)
        .where('id', '=', sessionId)
        .where('status', '=', 'draft')
        .where('revision', '=', expectedRevision)
        .returningAll()
        .executeTakeFirst();
      if (!row) return null;

      const entity = this.toSession(row, timezone);
      await this.insertAudit(db, organizationId, 'session', entity.id, 'scheduled', entity.revision, {
        previous_status: 'draft',
        current_status: 'scheduled',
        starts_at: entity.starts_at,
        ends_at: entity.ends_at,
        venue_id: entity.venue_id,
      }, actor);
      return entity;
    });
  }

  async listSessionSpeakerIds(organizationId: string, sessionIds: string[]): Promise<Map<string, string[]>> {
    if (sessionIds.length === 0) return new Map();
    return this.databaseService.withTenantTransaction(organizationId, async (db) => {
      const rows = await db.selectFrom('session_speakers').select(['session_id', 'speaker_id'])
        .where('organization_id', '=', organizationId).where('session_id', 'in', sessionIds)
        .orderBy('display_order').execute();
      const grouped = new Map<string, string[]>();
      for (const row of rows) grouped.set(row.session_id, [...(grouped.get(row.session_id) ?? []), row.speaker_id]);
      return grouped;
    });
  }

  async reserveExclusiveSpeakers(organizationId: string, eventId: string, session: SessionEntity, speakerIds: string[], exclusiveIds: string[], actor: AuditContext): Promise<void> {
    if (!exclusiveIds.length) return;
    await this.databaseService.withTenantTransaction(organizationId, async (db) => {
      await db.insertInto('resource_reservations').values(exclusiveIds.map((speakerId) => ({
        id: generateUuidV7(), organization_id: organizationId, event_id: eventId, session_id: session.id,
        venue_id: null, speaker_id: speakerId,
        reserved_range: sql`tstzrange(${new Date(session.starts_at)}, ${new Date(session.ends_at)}, '[)')`,
        released_at: null, created_at: new Date(), created_by: actor.actorId,
      }))).execute();
    });
  }

  async createVenueReservation(
    organizationId: string,
    eventId: string,
    session: SessionEntity,
    actor: AuditContext,
  ): Promise<void> {
    await this.databaseService.withTenantTransaction(organizationId, async (db) => {
      await db.insertInto('resource_reservations').values({
        id: generateUuidV7(),
        organization_id: organizationId,
        event_id: eventId,
        session_id: session.id,
        venue_id: session.venue_id,
        reserved_range: sql`tstzrange(${new Date(session.starts_at)}, ${new Date(session.ends_at)}, '[)')`,
        released_at: null,
        created_at: new Date(),
        created_by: actor.actorId,
      }).execute();
    });
  }

  private async insertAudit(
    db: Kysely<DatabaseSchema>,
    organizationId: string,
    entityType: string,
    entityId: string,
    action: string,
    revision: number,
    diff: Record<string, unknown>,
    actor: AuditContext,
  ): Promise<void> {
    await db.insertInto('audit').values({
      organization_id: organizationId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      actor_id: actor.actorId,
      actor_roles: actor.actorRoles,
      request_id: actor.requestId ?? null,
      idempotency_key: actor.idempotencyKey ?? null,
      revision_number: revision,
      diff,
      payload_hash: computeSha256(diff),
      client_ip: actor.clientIp ?? null,
      user_agent: actor.userAgent ?? null,
    }).execute();
  }

  private toVenue(row: Record<string, unknown>): VenueEntity {
    return {
      id: String(row.id),
      organization_id: String(row.organization_id),
      kind: row.kind as VenueEntity['kind'],
      parent_venue_id: row.parent_venue_id ? String(row.parent_venue_id) : null,
      name: String(row.name),
      location: row.location as VenueLocation,
      capacity: row.capacity === null ? null : Number(row.capacity),
      exclusive: Boolean(row.exclusive),
      accessibility: row.accessibility as string[],
      archived_at: row.archived_at ? new Date(row.archived_at as Date).toISOString() : null,
      revision: Number(row.revision),
      created_at: new Date(row.created_at as Date).toISOString(),
      updated_at: new Date(row.updated_at as Date).toISOString(),
    };
  }

  private toProgram(row: Record<string, unknown>): ProgramEntity {
    return {
      id: String(row.id),
      organization_id: String(row.organization_id),
      event_id: String(row.event_id),
      slug: String(row.slug),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      display_order: Number(row.display_order),
      color: row.color ? String(row.color) : null,
      archived_at: row.archived_at ? new Date(row.archived_at as Date).toISOString() : null,
      revision: Number(row.revision),
      created_at: new Date(row.created_at as Date).toISOString(),
      updated_at: new Date(row.updated_at as Date).toISOString(),
    };
  }

  private toSession(row: Record<string, unknown>, timezone = 'UTC'): SessionEntity {
    return {
      id: String(row.id),
      organization_id: String(row.organization_id),
      event_id: String(row.event_id),
      program_id: String(row.program_id),
      title: String(row.title),
      description: row.description ? String(row.description) : null,
      starts_at: new Date(row.starts_at as Date).toISOString(),
      ends_at: new Date(row.ends_at as Date).toISOString(),
      timezone,
      venue_id: String(row.venue_id),
      speaker_ids: [],
      status: row.status as SessionEntity['status'],
      status_reason: row.status_reason ? String(row.status_reason) : null,
      revision: Number(row.revision),
      created_at: new Date(row.created_at as Date).toISOString(),
      updated_at: new Date(row.updated_at as Date).toISOString(),
    };
  }
}
