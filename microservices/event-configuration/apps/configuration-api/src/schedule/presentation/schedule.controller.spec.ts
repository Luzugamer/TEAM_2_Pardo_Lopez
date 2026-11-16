import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from '../application/schedule.service';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { ProblemDetailsException } from '../../shared/errors/problem-details.exception';
import { Request, Response } from 'express';

const mockClaims: TenantClaims = {
  sub: '0194eb00-0000-7000-9000-000000000001',
  organization_id: '0194eb00-0000-7000-8000-000000000001',
  roles: ['event_manager'],
  scopes: ['events:write', 'events:read'],
};

const sampleSession = {
  id: '0194eb20-0000-7000-8000-000000000001',
  organization_id: mockClaims.organization_id,
  event_id: '0194eb10-0000-7000-8000-000000000001',
  program_id: '0194eb30-0000-7000-8000-000000000001',
  venue_id: '0194eb40-0000-7000-8000-000000000001',
  title: 'Keynote Speech',
  description: 'Annual opening keynote',
  starts_at: '2026-12-01T10:00:00.000Z',
  ends_at: '2026-12-01T11:00:00.000Z',
  timezone: 'America/Lima',
  speaker_ids: ['speaker-1'],
  status: 'draft' as const,
  status_reason: null,
  revision: 1,
  created_at: '2026-11-08T10:00:00.000Z',
  updated_at: '2026-11-08T10:00:00.000Z',
};

describe('ScheduleController - Session Lifecycle (EC-014)', () => {
  let controller: ScheduleController;
  let scheduleService: {
    getSession: ReturnType<typeof vi.fn>;
    patchSession: ReturnType<typeof vi.fn>;
    cancelSession: ReturnType<typeof vi.fn>;
    completeSession: ReturnType<typeof vi.fn>;
  };
  let idempotencyService: {
    executeOnce: ReturnType<typeof vi.fn>;
  };
  let mockRequest: Partial<Request>;
  let mockResponse: {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    scheduleService = {
      getSession: vi.fn().mockResolvedValue(sampleSession),
      patchSession: vi.fn().mockResolvedValue({ ...sampleSession, revision: 2, title: 'Updated Keynote' }),
      cancelSession: vi.fn().mockResolvedValue({ ...sampleSession, status: 'cancelled', revision: 2 }),
      completeSession: vi.fn().mockResolvedValue({ ...sampleSession, status: 'completed', revision: 2 }),
    };

    idempotencyService = {
      executeOnce: vi.fn().mockImplementation(
        async (_orgId, _sub, _op, _key, _path, _payload, command) => {
          return command();
        },
      ),
    };

    mockRequest = {
      originalUrl: '/configuration/v1/events/some-event/sessions',
      header: vi.fn().mockReturnValue('test-agent'),
    };

    mockResponse = {
      setHeader: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    controller = new ScheduleController(
      scheduleService as unknown as ScheduleService,
      idempotencyService as unknown as IdempotencyService,
    );
  });

  describe('GET /events/:eventId/sessions/:sessionId', () => {
    it('returns session and sets ETag header', async () => {
      const result = await controller.getSession(
        mockClaims,
        sampleSession.event_id,
        sampleSession.id,
        mockResponse as unknown as Response,
      );

      expect(scheduleService.getSession).toHaveBeenCalledWith(
        mockClaims,
        sampleSession.event_id,
        sampleSession.id,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('ETag', '"1"');
      expect(result).toEqual(sampleSession);
    });
  });

  describe('PATCH /events/:eventId/sessions/:sessionId', () => {
    it('updates session and sets updated ETag header', async () => {
      const result = await controller.patchSession(
        mockClaims,
        sampleSession.event_id,
        sampleSession.id,
        '"1"',
        { title: 'Updated Keynote' },
        mockRequest as Request,
        mockResponse as unknown as Response,
      );

      expect(scheduleService.patchSession).toHaveBeenCalledWith(
        mockClaims,
        sampleSession.event_id,
        sampleSession.id,
        1,
        { title: 'Updated Keynote' },
        expect.anything(),
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('ETag', '"2"');
      expect(result.title).toBe('Updated Keynote');
    });

    it('throws 428 Precondition Required when If-Match header is missing', async () => {
      await expect(
        controller.patchSession(
          mockClaims,
          sampleSession.event_id,
          sampleSession.id,
          undefined,
          { title: 'Updated Keynote' },
          mockRequest as Request,
          mockResponse as unknown as Response,
        ),
      ).rejects.toThrow(ProblemDetailsException);
    });
  });

  describe('POST /events/:eventId/sessions/:sessionId/cancellations', () => {
    const validIdempotencyKey = 'valid-idempotency-key-123456';

    it('cancels session with If-Match and Idempotency-Key', async () => {
      await controller.cancelSession(
        mockClaims,
        sampleSession.event_id,
        sampleSession.id,
        '"1"',
        validIdempotencyKey,
        { reason: 'Illness' },
        mockRequest as Request,
        mockResponse as unknown as Response,
      );

      expect(idempotencyService.executeOnce).toHaveBeenCalled();
      expect(scheduleService.cancelSession).toHaveBeenCalledWith(
        mockClaims,
        sampleSession.event_id,
        sampleSession.id,
        1,
        { reason: 'Illness' },
        expect.anything(),
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('throws 400 when Idempotency-Key is too short or missing', async () => {
      await expect(
        controller.cancelSession(
          mockClaims,
          sampleSession.event_id,
          sampleSession.id,
          '"1"',
          'short-key',
          { reason: 'Illness' },
          mockRequest as Request,
          mockResponse as unknown as Response,
        ),
      ).rejects.toThrow(ProblemDetailsException);
    });
  });

  describe('POST /events/:eventId/sessions/:sessionId/completions', () => {
    const validIdempotencyKey = 'valid-idempotency-key-123456';

    it('completes session with If-Match and Idempotency-Key', async () => {
      await controller.completeSession(
        mockClaims,
        sampleSession.event_id,
        sampleSession.id,
        '"1"',
        validIdempotencyKey,
        {},
        mockRequest as Request,
        mockResponse as unknown as Response,
      );

      expect(idempotencyService.executeOnce).toHaveBeenCalled();
      expect(scheduleService.completeSession).toHaveBeenCalledWith(
        mockClaims,
        sampleSession.event_id,
        sampleSession.id,
        1,
        {},
        expect.anything(),
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });
});
