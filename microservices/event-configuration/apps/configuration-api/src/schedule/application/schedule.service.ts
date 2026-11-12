import { Inject, Injectable } from '@nestjs/common';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { DomainException } from '../../shared/errors/domain.exception';
import { SERIALIZABLE_TRANSACTION, SerializableTransaction } from '../../shared/application/serializable-transaction.port';
import { hasAccessibleContrast } from '../domain/color-contrast';
import { validateScheduleCandidates } from '../domain/schedule-validation';
import { ProgramPatch, ProgramWrite, SCHEDULE_REPOSITORY, ScheduleListQuery, ScheduleRepositoryPort, ScheduleValidationRequest, SessionWrite, VenuePatch, VenueWrite } from '../domain/ports/schedule-repository.port';
import { ProgramEntity, SessionEntity, VenueEntity } from '../domain/models/schedule.entity';
import { EVENT_SNAPSHOT_READER, EventSnapshotReader } from './ports/event-snapshot-reader.port';

export interface AuditMetadata {
  requestId?: string;
  idempotencyKey?: string;
  clientIp?: string;
  userAgent?: string;
}

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(SCHEDULE_REPOSITORY) private readonly repository: ScheduleRepositoryPort,
    @Inject(EVENT_SNAPSHOT_READER) private readonly eventsService: EventSnapshotReader,
    @Inject(SERIALIZABLE_TRANSACTION) private readonly databaseService: SerializableTransaction,
  ) {}

  async listVenues(claims: TenantClaims, query: ScheduleListQuery) {
    return this.repository.listVenues(claims.organization_id, query.limit, query.cursor);
  }

  async createVenue(claims: TenantClaims, dto: VenueWrite, metadata: AuditMetadata): Promise<VenueEntity> {
    this.requireText(dto.name, 'name');
    if (dto.location?.address) this.requireText(dto.location.address, 'location.address');
    if (dto.kind === 'room' && !dto.parent_venue_id) {
      throw DomainException.unprocessable('Rooms require a parent venue.', [
        { name: 'parent_venue_id', reason: 'Required when kind is room.' },
      ]);
    }
    if (dto.kind === 'venue' && dto.parent_venue_id) {
      throw DomainException.unprocessable('A venue cannot have a parent venue.', [
        { name: 'parent_venue_id', reason: 'Must be omitted when kind is venue.' },
      ]);
    }
    if (dto.parent_venue_id) {
      const parent = await this.repository.findVenueParent(claims.organization_id, dto.parent_venue_id);
      if (!parent || parent.kind !== 'venue') {
        throw DomainException.notFound('Parent venue was not found.', 'VENUE_NOT_FOUND');
      }
    }

    return this.repository.createVenue(claims.organization_id, this.auditContext(claims, metadata), dto);
  }

  async updateVenue(claims: TenantClaims, id: string, revision: number, dto: VenuePatch, metadata: AuditMetadata) {
    if (!Object.keys(dto).length) throw DomainException.badRequest('At least one venue field is required.');
    const current = await this.repository.findActiveVenue(claims.organization_id, id);
    if (!current) throw DomainException.notFound('Venue was not found.', 'venue_not_found');
    if (current.revision !== revision) throw DomainException.preconditionFailed('Venue revision is stale.');
    const parentId = Object.prototype.hasOwnProperty.call(dto, 'parent_venue_id') ? dto.parent_venue_id : current.parent_venue_id;
    if ((dto.kind ?? current.kind) === 'room' && !parentId) {
      throw DomainException.unprocessable('Rooms require a parent venue.');
    }
    if ((dto.kind ?? current.kind) === 'venue' && parentId) {
      throw DomainException.unprocessable('A venue cannot have a parent venue.');
    }
    if (parentId) {
      const parent = await this.repository.findVenueParent(claims.organization_id, parentId);
      if (!parent || parent.kind !== 'venue' || parent.id === id) throw DomainException.notFound('Parent venue was not found.', 'venue_not_found');
    }
    return this.repository.updateVenue(claims.organization_id, id, revision, this.auditContext(claims, metadata), dto);
  }

  async getVenue(claims: TenantClaims, id: string) {
    const venue = await this.repository.findActiveVenue(claims.organization_id, id);
    if (!venue) throw DomainException.notFound('Venue was not found.', 'venue_not_found');
    return venue;
  }

  async getProgram(claims: TenantClaims, eventId: string, id: string) {
    await this.readConfigurableEvent(claims, eventId);
    const program = await this.repository.findActiveProgram(claims.organization_id, eventId, id);
    if (!program) throw DomainException.notFound('Program was not found.', 'program_not_found');
    return program;
  }

  async archiveVenue(claims: TenantClaims, id: string, revision: number, metadata: AuditMetadata) {
    return this.repository.archiveVenue(claims.organization_id, id, revision, this.auditContext(claims, metadata));
  }

  async updateProgram(claims: TenantClaims, eventId: string, id: string, revision: number, dto: ProgramPatch, metadata: AuditMetadata) {
    await this.readConfigurableEvent(claims, eventId);
    if (!Object.keys(dto).length) throw DomainException.badRequest('At least one program field is required.');
    if (dto.color && !hasAccessibleContrast(dto.color)) throw DomainException.unprocessable(
      'Program color must have a WCAG contrast ratio of at least 4.5:1 against white.',
      [{ name: 'color', reason: 'Choose a darker color for the white agenda canvas.' }], 'accessible_color_required');
    return this.repository.updateProgram(claims.organization_id, eventId, id, revision, this.auditContext(claims, metadata), dto);
  }

  async archiveProgram(claims: TenantClaims, eventId: string, id: string, revision: number, metadata: AuditMetadata) {
    await this.readConfigurableEvent(claims, eventId);
    return this.repository.archiveProgram(claims.organization_id, eventId, id, revision, this.auditContext(claims, metadata));
  }

  async listPrograms(claims: TenantClaims, eventId: string, query: ScheduleListQuery): Promise<{ items: ProgramEntity[]; next_cursor: string | null }> {
    await this.readConfigurableEvent(claims, eventId);
    return this.repository.listPrograms(claims.organization_id, eventId, query.limit, query.cursor);
  }

  async createProgram(
    claims: TenantClaims,
    eventId: string,
    dto: ProgramWrite,
    metadata: AuditMetadata,
  ): Promise<ProgramEntity> {
    this.requireText(dto.slug, 'slug');
    this.requireText(dto.name, 'name');
    if (dto.description !== undefined && dto.description !== null && dto.description.length > 3000) {
      throw DomainException.unprocessable('Program description is too long.');
    }
    if (dto.color && !hasAccessibleContrast(dto.color)) {
      throw DomainException.unprocessable(
        'Program color must have a WCAG contrast ratio of at least 4.5:1 against white.',
        [{ name: 'color', reason: 'Choose a darker color for the white agenda canvas.' }],
        'accessible_color_required',
      );
    }
    await this.readConfigurableEvent(claims, eventId);
    return this.repository.createProgram(
      claims.organization_id,
      eventId,
      this.auditContext(claims, metadata),
      dto,
    );
  }

  async listSessions(
    claims: TenantClaims,
    eventId: string,
    query: ScheduleListQuery,
  ): Promise<{ items: SessionEntity[]; next_cursor: string | null }> {
    const event = await this.readConfigurableEvent(claims, eventId);
    const startsAfter = query.starts_after ? this.parseInstant(query.starts_after, 'starts_after') : undefined;
    const endsBefore = query.ends_before ? this.parseInstant(query.ends_before, 'ends_before') : undefined;
    if (startsAfter && endsBefore && startsAfter >= endsBefore) {
      throw DomainException.unprocessable('starts_after must be earlier than ends_before.');
    }
    const page = await this.repository.listSessions(claims.organization_id, eventId, query.limit, query.cursor, {
      program_id: query.program_id, venue_id: query.venue_id, starts_after: startsAfter, ends_before: endsBefore,
    });
    const speakers = await this.repository.listSessionSpeakerIds(claims.organization_id, page.items.map((item) => item.id));
    return {
      ...page,
      items: page.items.map((session) => ({ ...session, timezone: event.timezone, speaker_ids: speakers.get(session.id) ?? [] })),
    };
  }

  async validateSchedule(claims: TenantClaims, eventId: string, dto: ScheduleValidationRequest) {
    const event = await this.readConfigurableEvent(claims, eventId, dto.expected_event_revision);
    const candidates = dto.candidate_sessions;
    const programIds = [...new Set(candidates.map((candidate) => candidate.program_id))];
    const venueIds = [...new Set(candidates.map((candidate) => candidate.venue_id))];
    const speakerIds = [...new Set(candidates.flatMap((candidate) => candidate.speaker_ids ?? []))];
    const context = await this.repository.getValidationResources(claims.organization_id, eventId, programIds, venueIds, speakerIds);
    const result = validateScheduleCandidates(candidates.map((candidate) => {
      const parsedStarts = this.parseInstant(candidate.starts_at, 'starts_at');
      const parsedEnds = this.parseInstant(candidate.ends_at, 'ends_at');
      const speakerMap = new Map<string, boolean>();
      for (const speakerId of candidate.speaker_ids ?? []) {
        const exclusive = context.speakers.get(speakerId);
        if (exclusive !== undefined) speakerMap.set(speakerId, exclusive);
      }
      return {
        venue_id: candidate.venue_id,
        speaker_ids: candidate.speaker_ids ?? [],
        starts_at: parsedStarts.toISOString(),
        ends_at: parsedEnds.toISOString(),
        program_valid: context.programIds.has(candidate.program_id),
        venue_valid: context.venues.has(candidate.venue_id),
        venue_exclusive: context.venues.get(candidate.venue_id) ?? false,
        active_speakers: speakerMap,
      };
    }), context.reservations, event.starts_at, event.ends_at);
    return {
      event_id: eventId,
      expected_event_revision: dto.expected_event_revision,
      ...result,
    };
  }

  async createDraftSession(
    claims: TenantClaims,
    eventId: string,
    dto: SessionWrite,
    metadata: AuditMetadata,
  ): Promise<SessionEntity> {
    this.requireText(dto.title, 'title');
    const event = await this.readConfigurableEvent(claims, eventId);
    const startsAt = this.parseInstant(dto.starts_at, 'starts_at');
    const endsAt = this.parseInstant(dto.ends_at, 'ends_at');
    if (startsAt >= endsAt) {
      throw DomainException.unprocessable('Session starts_at must be earlier than ends_at.', [
        { name: 'starts_at', reason: 'Must be before ends_at.' },
        { name: 'ends_at', reason: 'Must be after starts_at.' },
      ], 'invalid_time_range');
    }
    await this.requireActiveReferences(claims.organization_id, eventId, dto.program_id, dto.venue_id);
    const speakerIds = [...new Set(dto.speaker_ids ?? [])];
    if (speakerIds.length !== (dto.speaker_ids ?? []).length) {
      throw DomainException.unprocessable('speaker_ids must not contain duplicates.');
    }
    const speakers = await this.repository.findActiveSpeakers(claims.organization_id, speakerIds);
    if (speakers.length !== speakerIds.length) throw DomainException.notFound('One or more speakers were not found.', 'speaker_not_found');
    return this.repository.createDraftSession(
      claims.organization_id,
      eventId,
      this.auditContext(claims, metadata),
      dto,
      event.timezone,
    );
  }

  async scheduleSession(
    claims: TenantClaims,
    eventId: string,
    sessionId: string,
    expectedSessionRevision: number,
    dto: { expected_event_revision: number },
    metadata: AuditMetadata,
  ): Promise<SessionEntity> {
    let conflictSession: SessionEntity | undefined;
    let conflictSpeakerIds: string[] = [];
    try {
      return await this.databaseService.withSerializableTransaction(claims.organization_id, async () => {
        const event = await this.readConfigurableEvent(claims, eventId, dto.expected_event_revision);
        const current = await this.repository.findSession(claims.organization_id, eventId, sessionId);
        if (!current) throw DomainException.notFound('Session was not found.', 'SESSION_NOT_FOUND');
        if (current.revision !== expectedSessionRevision) {
          throw DomainException.preconditionFailed(
            `Session revision mismatch: current revision is ${current.revision}, expected ${expectedSessionRevision}.`,
          );
        }
        if (current.status !== 'draft') {
          throw DomainException.conflict(
            'Only a draft session can be scheduled.',
            'invalid_state_transition',
          );
        }

        const startsAt = this.parseInstant(current.starts_at, 'starts_at');
        const endsAt = this.parseInstant(current.ends_at, 'ends_at');
        const eventStartsAt = this.parseInstant(event.starts_at, 'event.starts_at');
        const eventEndsAt = this.parseInstant(event.ends_at, 'event.ends_at');
        if (startsAt < eventStartsAt || endsAt > eventEndsAt) {
          throw DomainException.unprocessable(
            'Session interval must be contained in the event window.',
            [{ name: 'starts_at', reason: 'The session must fit within the event start and end instants.' }],
            'event_window_violation',
          );
        }

        const venue = await this.repository.findActiveVenue(claims.organization_id, current.venue_id);
        if (!venue) throw DomainException.notFound('Venue was not found.', 'VENUE_NOT_FOUND');
        const program = await this.repository.findActiveProgram(claims.organization_id, eventId, current.program_id);
        if (!program) throw DomainException.notFound('Program was not found.', 'PROGRAM_NOT_FOUND');
        const speakerIds = (await this.repository.listSessionSpeakerIds(claims.organization_id, [current.id])).get(current.id) ?? [];
        const speakers = await this.repository.findActiveSpeakers(claims.organization_id, speakerIds);
        if (speakers.length !== speakerIds.length) throw DomainException.notFound('One or more speakers were not found.', 'speaker_not_found');
        const validationContext = await this.repository.getValidationResources(
          claims.organization_id, eventId, [current.program_id], [current.venue_id], speakerIds,
        );
        const domainResult = validateScheduleCandidates([{
          venue_id: current.venue_id,
          speaker_ids: speakerIds,
          starts_at: current.starts_at,
          ends_at: current.ends_at,
          program_valid: validationContext.programIds.has(current.program_id),
          venue_valid: validationContext.venues.has(current.venue_id),
          venue_exclusive: validationContext.venues.get(current.venue_id) ?? false,
          active_speakers: new Map(speakers.map((speaker) => [speaker.id, speaker.exclusive])),
        }], validationContext.reservations.filter((reservation) => reservation.session_id !== current.id), event.starts_at, event.ends_at);
        if (domainResult.errors.length) {
          throw DomainException.unprocessable('Session does not pass schedule validation.',
            domainResult.errors.map((reason) => ({ name: 'session', reason })));
        }
        if (domainResult.conflicts.length) {
          throw new DomainException({
            type: 'urn:problem:schedule-conflict', title: 'Schedule Conflict', status: 409,
            detail: 'One or more exclusive resources are already reserved during this interval.',
            code: 'schedule_conflict', conflicts: domainResult.conflicts,
          });
        }
        conflictSession = current;
        conflictSpeakerIds = speakers.filter((speaker) => speaker.exclusive).map((speaker) => speaker.id);

        const actor = this.auditContext(claims, metadata);
        const scheduled = await this.repository.markSessionScheduled(
          claims.organization_id,
          eventId,
          sessionId,
          expectedSessionRevision,
          actor,
          event.timezone,
        );
        if (!scheduled) {
          const latest = await this.repository.findSession(claims.organization_id, eventId, sessionId);
          if (!latest) throw DomainException.notFound('Session was not found.', 'SESSION_NOT_FOUND');
          if (latest.revision !== expectedSessionRevision) {
            throw DomainException.preconditionFailed('Session revision changed while scheduling.');
          }
          throw DomainException.conflict('Only a draft session can be scheduled.', 'invalid_state_transition');
        }

        if (venue.exclusive) {
          await this.repository.createVenueReservation(claims.organization_id, eventId, scheduled, actor);
        }
        await this.repository.reserveExclusiveSpeakers(claims.organization_id, eventId, scheduled, speakerIds,
          speakers.filter((speaker) => speaker.exclusive).map((speaker) => speaker.id), actor);
        return scheduled;
      });
    } catch (error) {
      const constraint = postgresExclusionConstraint(error);
      if (constraint && conflictSession) {
        throw new DomainException({
          type: 'urn:problem:schedule-conflict',
          title: 'Schedule Conflict',
          status: 409,
          detail: 'The exclusive venue is already reserved during this interval.',
          code: 'schedule_conflict',
          conflicts: constraint === 'ex_resource_reservations_speaker_range'
            ? conflictSpeakerIds.map((speakerId) => ({ resource_type: 'speaker', resource_id: speakerId,
              starts_at: conflictSession!.starts_at, ends_at: conflictSession!.ends_at }))
            : [{ resource_type: 'venue', resource_id: conflictSession.venue_id,
              starts_at: conflictSession.starts_at, ends_at: conflictSession.ends_at }],
        });
      }
      throw error;
    }
  }

  private async readConfigurableEvent(claims: TenantClaims, eventId: string, expectedRevision?: number) {
    const { snapshot } = await this.eventsService.readEventSnapshot(
      claims.organization_id,
      eventId,
      expectedRevision,
    );
    if (snapshot.status === 'cancelled' || snapshot.status === 'archived') {
      throw DomainException.conflict(
        'Agenda cannot be changed for a cancelled or archived event.',
        'event_not_schedulable',
      );
    }
    return snapshot;
  }

  private async requireActiveReferences(
    organizationId: string,
    eventId: string,
    programId: string,
    venueId: string,
  ): Promise<void> {
    const [program, venue] = await Promise.all([
      this.repository.findActiveProgram(organizationId, eventId, programId),
      this.repository.findActiveVenue(organizationId, venueId),
    ]);
    if (!program) throw DomainException.notFound('Program was not found.', 'PROGRAM_NOT_FOUND');
    if (!venue) throw DomainException.notFound('Venue was not found.', 'VENUE_NOT_FOUND');
  }

  private parseInstant(value: string, field: string): Date {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
      throw DomainException.unprocessable(
        `${field} must include a UTC offset.`,
        [{ name: field, reason: 'Provide an RFC 3339 instant with Z or an explicit offset.' }],
        'invalid_datetime',
      );
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw DomainException.unprocessable(`${field} is not a valid RFC 3339 instant.`);
    }
    return date;
  }

  private requireText(value: string | undefined, field: string): void {
    if (!value || value.trim().length === 0) {
      throw DomainException.unprocessable(`${field} must not be empty.`, [
        { name: field, reason: 'Provide a non-empty value.' },
      ]);
    }
  }

  private auditContext(claims: TenantClaims, metadata: AuditMetadata) {
    return {
      actorId: claims.sub,
      actorRoles: claims.roles,
      requestId: metadata.requestId ?? claims.request_id,
      idempotencyKey: metadata.idempotencyKey,
      clientIp: metadata.clientIp ?? claims.client_ip,
      userAgent: metadata.userAgent ?? claims.user_agent,
    };
  }
}

function postgresExclusionConstraint(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError.code !== '23P01') return null;
  return ['ex_resource_reservations_venue_range', 'ex_resource_reservations_speaker_range'].includes(databaseError.constraint ?? '')
    ? databaseError.constraint!
    : null;
}
