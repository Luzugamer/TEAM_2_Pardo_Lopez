import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainException } from '../../shared/errors/domain.exception';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { ScheduleService } from './schedule.service';
import { ScheduleRepository } from '../infrastructure/persistence/schedule.repository';
import { DatabaseService } from '../../shared/database/database.service';

const claims: TenantClaims = {
  sub: '0194eb00-0000-7000-9000-000000000001',
  organization_id: '0194eb00-0000-7000-8000-000000000001',
  roles: ['event_manager'],
  scopes: ['events:write'],
};

const event = {
  id: '0194eb10-0000-7000-8000-000000000001',
  organization_id: claims.organization_id,
  starts_at: '2026-12-01T10:00:00.000Z',
  ends_at: '2026-12-01T18:00:00.000Z',
  timezone: 'America/Lima',
  status: 'draft',
  revision_number: 4,
};

const draftSession = {
  id: '0194eb20-0000-7000-8000-000000000001',
  organization_id: claims.organization_id,
  event_id: event.id,
  program_id: '0194eb30-0000-7000-8000-000000000001',
  venue_id: '0194eb40-0000-7000-8000-000000000001',
  title: 'Opening session',
  description: null,
  starts_at: '2026-12-01T11:00:00.000Z',
  ends_at: '2026-12-01T12:00:00.000Z',
  timezone: 'America/Lima',
  speaker_ids: [],
  status: 'draft',
  status_reason: null,
  revision: 1,
  created_at: '2026-11-08T10:00:00.000Z',
  updated_at: '2026-11-08T10:00:00.000Z',
};

describe('ScheduleService — Etapa 1', () => {
  let service: ScheduleService;
  let repository: {
    findActiveVenue: ReturnType<typeof vi.fn>;
    findVenueParent: ReturnType<typeof vi.fn>;
    findActiveSpeakers: ReturnType<typeof vi.fn>;
    listSessionSpeakerIds: ReturnType<typeof vi.fn>;
    getValidationResources: ReturnType<typeof vi.fn>;
    findActiveProgram: ReturnType<typeof vi.fn>;
    findSession: ReturnType<typeof vi.fn>;
    markSessionScheduled: ReturnType<typeof vi.fn>;
    createVenueReservation: ReturnType<typeof vi.fn>;
    createDraftSession: ReturnType<typeof vi.fn>;
    reserveExclusiveSpeakers: ReturnType<typeof vi.fn>;
    findSessionWithSpeakers: ReturnType<typeof vi.fn>;
    updateSession: ReturnType<typeof vi.fn>;
    cancelSession: ReturnType<typeof vi.fn>;
    completeSession: ReturnType<typeof vi.fn>;
    releaseSessionReservations: ReturnType<typeof vi.fn>;
  };
  let eventsService: { readEventSnapshot: ReturnType<typeof vi.fn> };
  let databaseService: { withSerializableTransaction: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repository = {
      findActiveVenue: vi.fn().mockResolvedValue({ ...draftSession, kind: 'room', exclusive: true }),
      findVenueParent: vi.fn(),
      findActiveSpeakers: vi.fn().mockResolvedValue([]),
      listSessionSpeakerIds: vi.fn().mockResolvedValue(new Map([[draftSession.id, []]])),
      getValidationResources: vi.fn().mockResolvedValue({
        programIds: new Set([draftSession.program_id]), venues: new Map([[draftSession.venue_id, true]]),
        speakers: new Map(), reservations: [],
      }),
      findActiveProgram: vi.fn().mockResolvedValue({ id: draftSession.program_id }),
      findSession: vi.fn().mockResolvedValue(draftSession),
      markSessionScheduled: vi.fn().mockResolvedValue({ ...draftSession, status: 'scheduled', revision: 2 }),
      createVenueReservation: vi.fn().mockResolvedValue(undefined),
      createDraftSession: vi.fn().mockResolvedValue(draftSession),
      reserveExclusiveSpeakers: vi.fn().mockResolvedValue(undefined),
      findSessionWithSpeakers: vi.fn().mockResolvedValue(draftSession),
      updateSession: vi.fn().mockResolvedValue({ ...draftSession, revision: 2 }),
      cancelSession: vi.fn().mockResolvedValue({ ...draftSession, status: 'cancelled', revision: 2, status_reason: 'Speaker unavailable' }),
      completeSession: vi.fn().mockResolvedValue({ ...draftSession, status: 'completed', revision: 2 }),
      releaseSessionReservations: vi.fn().mockResolvedValue(undefined),
    };
    eventsService = {
      readEventSnapshot: vi.fn().mockResolvedValue({ snapshot: event, hash: 'event-hash' }),
    };
    databaseService = {
      withSerializableTransaction: vi.fn().mockImplementation((_organizationId: string, callback: () => Promise<unknown>) => callback()),
    };
    service = new ScheduleService(
      repository as unknown as ScheduleRepository,
      eventsService as unknown as import('../../events/application/events.service').EventsService,
      databaseService as unknown as DatabaseService,
    );
  });

  it('creates a draft without reserving a venue', async () => {
    await service.createDraftSession(claims, event.id, {
      program_id: draftSession.program_id,
      title: 'Opening session',
      starts_at: draftSession.starts_at,
      ends_at: draftSession.ends_at,
      venue_id: draftSession.venue_id,
    }, {});

    expect(repository.createDraftSession).toHaveBeenCalledOnce();
    expect(repository.createVenueReservation).not.toHaveBeenCalled();
  });

  it('previews a schedule without writing sessions, audit or reservations', async () => {
    const result = await service.validateSchedule(claims, event.id, {
      expected_event_revision: 4,
      candidate_sessions: [{
        program_id: draftSession.program_id, title: draftSession.title,
        starts_at: draftSession.starts_at, ends_at: draftSession.ends_at, venue_id: draftSession.venue_id,
      }],
    });
    expect(result.is_valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(repository.createDraftSession).not.toHaveBeenCalled();
    expect(repository.markSessionScheduled).not.toHaveBeenCalled();
    expect(repository.createVenueReservation).not.toHaveBeenCalled();
  });

  it('rejects speaker IDs that do not resolve to active tenant profiles', async () => {
    await expect(service.createDraftSession(claims, event.id, {
      program_id: draftSession.program_id,
      title: 'Opening session',
      starts_at: draftSession.starts_at,
      ends_at: draftSession.ends_at,
      venue_id: draftSession.venue_id,
      speaker_ids: ['0194eb50-0000-7000-8000-000000000001'],
    }, {})).rejects.toMatchObject({ problem: { code: 'speaker_not_found' } });
    expect(repository.createDraftSession).not.toHaveBeenCalled();
  });

  it('rejects an invalid time range and a timestamp without an explicit offset', async () => {
    await expect(service.createDraftSession(claims, event.id, {
      program_id: draftSession.program_id,
      title: 'Opening session',
      starts_at: '2026-12-01T12:00:00-05:00',
      ends_at: '2026-12-01T11:00:00-05:00',
      venue_id: draftSession.venue_id,
    }, {})).rejects.toMatchObject({ problem: { code: 'invalid_time_range' } });

    await expect(service.createDraftSession(claims, event.id, {
      program_id: draftSession.program_id,
      title: 'Opening session',
      starts_at: '2026-12-01T11:00:00',
      ends_at: '2026-12-01T12:00:00Z',
      venue_id: draftSession.venue_id,
    }, {})).rejects.toMatchObject({ problem: { code: 'invalid_datetime' } });
    expect(repository.createDraftSession).not.toHaveBeenCalled();
  });

  it('rejects cancelled events and missing active references', async () => {
    eventsService.readEventSnapshot.mockResolvedValueOnce({
      snapshot: { ...event, status: 'cancelled' }, hash: 'event-hash',
    });
    await expect(service.createProgram(claims, event.id, {
      slug: 'general', name: 'General', display_order: 0,
    }, {})).rejects.toMatchObject({ problem: { code: 'event_not_schedulable' } });

    eventsService.readEventSnapshot.mockResolvedValue({ snapshot: event, hash: 'event-hash' });
    repository.findActiveProgram.mockResolvedValueOnce(null);
    await expect(service.createDraftSession(claims, event.id, {
      program_id: draftSession.program_id,
      title: 'Opening session',
      starts_at: draftSession.starts_at,
      ends_at: draftSession.ends_at,
      venue_id: draftSession.venue_id,
    }, {})).rejects.toMatchObject({ problem: { status: 404 } });
  });

  it('enforces white-canvas contrast for program colors', async () => {
    await expect(service.createProgram(claims, event.id, {
      slug: 'general', name: 'General', display_order: 0, color: '#EEEEEE',
    }, {})).rejects.toMatchObject({ problem: { code: 'accessible_color_required' } });
    expect(repository.createDraftSession).not.toHaveBeenCalled();
  });

  it('requires parent venues only for rooms and resolves the parent within the tenant', async () => {
    await expect(service.createVenue(claims, {
      kind: 'room', name: 'Room 1', location: { address: 'Test address' }, exclusive: true,
    }, {})).rejects.toMatchObject({ problem: { status: 422 } });

    repository.findVenueParent.mockResolvedValue({ kind: 'room' });
    await expect(service.createVenue(claims, {
      kind: 'room', name: 'Room 1', location: { address: 'Test address' }, exclusive: true,
      parent_venue_id: draftSession.venue_id,
    }, {})).rejects.toMatchObject({ problem: { code: 'venue_not_found' } });
  });

  it('leaves a draft unscheduled when it falls outside the event window', async () => {
    repository.findSession.mockResolvedValue({
      ...draftSession,
      ends_at: '2026-12-01T19:00:00.000Z',
    });

    await expect(service.scheduleSession(claims, event.id, draftSession.id, 1, {
      expected_event_revision: 4,
    }, {})).rejects.toMatchObject({
      problem: { code: 'event_window_violation', status: 422 },
    });
    expect(repository.markSessionScheduled).not.toHaveBeenCalled();
    expect(repository.createVenueReservation).not.toHaveBeenCalled();
  });

  it('validates revision, schedules, and reserves an exclusive venue', async () => {
    const result = await service.scheduleSession(claims, event.id, draftSession.id, 1, {
      expected_event_revision: 4,
    }, {});

    expect(eventsService.readEventSnapshot).toHaveBeenCalledWith(claims.organization_id, event.id, 4);
    expect(repository.markSessionScheduled).toHaveBeenCalledOnce();
    expect(repository.createVenueReservation).toHaveBeenCalledOnce();
    expect(result.status).toBe('scheduled');
  });

  it('returns only resource identifiers on an exclusion conflict', async () => {
    repository.createVenueReservation.mockRejectedValue({
      code: '23P01',
      constraint: 'ex_resource_reservations_venue_range',
    });

    try {
      await service.scheduleSession(claims, event.id, draftSession.id, 1, {
        expected_event_revision: 4,
      }, {});
      throw new Error('Expected a schedule conflict.');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      expect((error as DomainException).problem).toMatchObject({
        code: 'schedule_conflict',
        status: 409,
        conflicts: [{ resource_type: 'venue', resource_id: draftSession.venue_id }],
      });
      expect(JSON.stringify((error as DomainException).problem)).not.toContain('Opening session');
    }
  });

  describe('Session Lifecycle (EC-014)', () => {
    it('gets session detail with speaker ids', async () => {
      repository.findSessionWithSpeakers.mockResolvedValue({
        ...draftSession,
        speaker_ids: ['speaker-1', 'speaker-2'],
      });

      const session = await service.getSession(claims, event.id, draftSession.id);
      expect(session.id).toBe(draftSession.id);
      expect(session.speaker_ids).toEqual(['speaker-1', 'speaker-2']);
      expect(repository.findSessionWithSpeakers).toHaveBeenCalledWith(
        claims.organization_id,
        event.id,
        draftSession.id,
        event.timezone,
      );
    });

    it('throws 404 if session is not found in getSession', async () => {
      repository.findSessionWithSpeakers.mockResolvedValue(null);

      await expect(service.getSession(claims, event.id, 'non-existent')).rejects.toMatchObject({
        problem: { status: 404, code: 'session_not_found' },
      });
    });

    it('patches a draft session successfully with revision increment', async () => {
      const result = await service.patchSession(claims, event.id, draftSession.id, 1, {
        title: 'Updated Title',
      }, {});

      expect(repository.updateSession).toHaveBeenCalledWith(
        claims.organization_id,
        event.id,
        draftSession.id,
        1,
        expect.anything(),
        { title: 'Updated Title' },
        event.timezone,
      );
      expect(result.revision).toBe(2);
    });

    it('throws 412 on patchSession when revision mismatches', async () => {
      await expect(
        service.patchSession(claims, event.id, draftSession.id, 999, { title: 'Updated' }, {}),
      ).rejects.toMatchObject({
        problem: { status: 412 },
      });
    });

    it('throws 409 on patchSession when session is already cancelled', async () => {
      repository.findSessionWithSpeakers.mockResolvedValue({
        ...draftSession,
        status: 'cancelled',
      });

      await expect(
        service.patchSession(claims, event.id, draftSession.id, 1, { title: 'Updated' }, {}),
      ).rejects.toMatchObject({
        problem: { status: 409, code: 'session_terminal_state' },
      });
    });

    it('patches a scheduled session, releasing prior reservations and recalculating', async () => {
      const scheduledSession = {
        ...draftSession,
        status: 'scheduled',
      };
      repository.findSessionWithSpeakers.mockResolvedValue(scheduledSession);

      const result = await service.patchSession(claims, event.id, draftSession.id, 1, {
        title: 'Updated Scheduled Title',
      }, {});

      expect(repository.releaseSessionReservations).toHaveBeenCalledWith(
        claims.organization_id,
        event.id,
        draftSession.id,
      );
      expect(repository.updateSession).toHaveBeenCalled();
      expect(repository.createVenueReservation).toHaveBeenCalled();
      expect(result.revision).toBe(2);
    });

    it('cancels a session with reason and releases active reservations', async () => {
      const result = await service.cancelSession(claims, event.id, draftSession.id, 1, {
        reason: 'Keynote speaker fell ill',
      }, {});

      expect(repository.cancelSession).toHaveBeenCalledWith(
        claims.organization_id,
        event.id,
        draftSession.id,
        1,
        'Keynote speaker fell ill',
        expect.anything(),
        event.timezone,
      );
      expect(result.status).toBe('cancelled');
    });

    it('throws 409 on cancelSession when already completed or cancelled', async () => {
      repository.findSession.mockResolvedValue({
        ...draftSession,
        status: 'completed',
      });

      await expect(
        service.cancelSession(claims, event.id, draftSession.id, 1, { reason: 'Test' }, {}),
      ).rejects.toMatchObject({
        problem: { status: 409, code: 'session_terminal_state' },
      });
    });

    it('completes a scheduled session successfully', async () => {
      repository.findSession.mockResolvedValue({
        ...draftSession,
        status: 'scheduled',
      });

      const result = await service.completeSession(claims, event.id, draftSession.id, 1, {}, {});

      expect(repository.completeSession).toHaveBeenCalledWith(
        claims.organization_id,
        event.id,
        draftSession.id,
        1,
        null,
        expect.anything(),
        event.timezone,
      );
      expect(result.status).toBe('completed');
    });

    it('throws 409 on completeSession when session is not scheduled (e.g. draft)', async () => {
      repository.findSession.mockResolvedValue({
        ...draftSession,
        status: 'draft',
      });

      await expect(
        service.completeSession(claims, event.id, draftSession.id, 1, {}, {}),
      ).rejects.toMatchObject({
        problem: { status: 409, code: 'invalid_state_transition' },
      });
    });
  });
});
