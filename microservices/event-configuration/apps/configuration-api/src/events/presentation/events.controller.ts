import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Headers,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { EventsService } from '../application/events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { DuplicateEventDto } from './dto/duplicate-event.dto';
import { CancelEventDto } from './dto/cancel-event.dto';
import { CloseEventDto } from './dto/close-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { EventResponseDto, EventListResponseDto } from './dto/event-response.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { AssignmentResponseDto } from './dto/assignment-response.dto';
import { AuditResponseDto } from './dto/audit-response.dto';
import { EventHistoryResponseDto } from './dto/event-history-response.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { Claims } from '../../shared/auth/claims.decorator';
import { RequireScopes } from '../../shared/auth/scopes.decorator';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { CachedResponse, IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { ProblemDetailsException } from '../../shared/errors/problem-details.exception';
import { ApiSecurity } from '@nestjs/swagger';

@Controller('events')
@UseGuards(AuthGuard)
@ApiSecurity('DevActor')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  private async respondOnce<T>(
    claims: TenantClaims,
    key: string,
    requestPath: string,
    operation: string,
    payload: unknown,
    command: () => Promise<CachedResponse>,
    res: Response,
  ): Promise<T> {
    const response = await this.idempotencyService.executeOnce(
      claims.organization_id, claims.sub, operation, key, requestPath, payload, command,
    );
    for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
    res.status(response.statusCode);
    return response.body as T;
  }

  @Post()
  @RequireScopes('events:write')
  async createEvent(
    @Claims() claims: TenantClaims,
    @Body() dto: CreateEventDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EventResponseDto> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw ProblemDetailsException.badRequest(
        'Missing mandatory Idempotency-Key header for command POST operation.',
        [{ name: 'Idempotency-Key', reason: 'Header is required' }],
      );
    }

    const requestPath = req.originalUrl || req.url;
    return await this.respondOnce(claims, idempotencyKey, requestPath, 'create', dto, async () => {
      const result = await this.eventsService.createEvent(claims, dto, idempotencyKey);
      return { statusCode: HttpStatus.CREATED, headers: { ETag: `"${result.revision_number}"`, 'Content-Type': 'application/json' }, body: result };
    }, res);
  }

  @Get()
  @RequireScopes('events:write', 'events:read')
  async listEvents(
    @Claims() claims: TenantClaims,
    @Query() query: ListEventsQueryDto,
  ): Promise<EventListResponseDto> {
    return await this.eventsService.listEvents(claims, query);
  }

  @Get(':id')
  @RequireScopes('events:write', 'events:read')
  async getEventById(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.getEventById(claims, id);
    res.setHeader('ETag', `"${event.revision_number}"`);
    res.status(HttpStatus.OK);
    return event;
  }

  @Patch(':id')
  @RequireScopes('events:write')
  async updateEvent(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Headers('if-match') ifMatchHeader: string | undefined,
    @Body() dto: UpdateEventDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EventResponseDto> {
    if (!ifMatchHeader || ifMatchHeader.trim() === '') {
      throw ProblemDetailsException.preconditionRequired(
        "Header 'If-Match' is required for optimistic concurrency control on event modification.",
      );
    }

    const cleaned = ifMatchHeader.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
    const expectedRevision = parseInt(cleaned, 10);
    if (isNaN(expectedRevision) || expectedRevision < 1) {
      throw ProblemDetailsException.badRequest(
        `Invalid 'If-Match' header value '${ifMatchHeader}'. Must be a valid positive revision integer or quoted ETag (e.g. "1").`,
        [{ name: 'If-Match', reason: 'Must be a valid revision number' }],
      );
    }

    const updated = await this.eventsService.updateEvent(claims, id, expectedRevision, dto);
    res.setHeader('ETag', `"${updated.revision_number}"`);
    res.status(HttpStatus.OK);
    return updated;
  }

  @Post(':id/duplications')
  @RequireScopes('events:write')
  async duplicateEvent(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Body() dto: DuplicateEventDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EventResponseDto> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw ProblemDetailsException.badRequest(
        'Missing mandatory Idempotency-Key header for duplicate command operation.',
        [{ name: 'Idempotency-Key', reason: 'Header is required' }],
      );
    }

    const requestPath = req.originalUrl || req.url;
    return await this.respondOnce(claims, idempotencyKey, requestPath, 'duplicate', dto, async () => {
      const result = await this.eventsService.duplicateEvent(claims, id, dto, idempotencyKey);
      return { statusCode: HttpStatus.CREATED, headers: { ETag: `"${result.revision_number}"`, 'Content-Type': 'application/json' }, body: result };
    }, res);
  }

  private parseIfMatch(header: string | undefined): number {
    if (!header || header.trim() === '') {
      throw ProblemDetailsException.preconditionRequired(
        "Header 'If-Match' is required for optimistic concurrency control on this transition.",
      );
    }
    const cleaned = header.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
    const revision = parseInt(cleaned, 10);
    if (isNaN(revision) || revision < 1) {
      throw ProblemDetailsException.badRequest(
        `Invalid 'If-Match' header value '${header}'. Must be a valid positive integer or quoted ETag (e.g. "1").`,
        [{ name: 'If-Match', reason: 'Must be a valid revision number' }],
      );
    }
    return revision;
  }

  @Post(':id/closures')
  @RequireScopes('events:publish')
  async closeEvent(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Headers('if-match') ifMatchHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CloseEventDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EventResponseDto> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw ProblemDetailsException.badRequest(
        'Missing mandatory Idempotency-Key header for close command operation.',
        [{ name: 'Idempotency-Key', reason: 'Header is required' }],
      );
    }

    const expectedRevision = this.parseIfMatch(ifMatchHeader);
    const requestPath = req.originalUrl || req.url;
    return await this.respondOnce(claims, idempotencyKey, requestPath, 'close', { ...dto, expectedRevision }, async () => {
      const result = await this.eventsService.closeEvent(claims, id, expectedRevision, dto, idempotencyKey);
      return { statusCode: HttpStatus.OK, headers: { ETag: `"${result.revision_number}"`, 'Content-Type': 'application/json' }, body: result };
    }, res);
  }

  @Post(':id/cancellations')
  @RequireScopes('events:publish')
  async cancelEvent(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Headers('if-match') ifMatchHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CancelEventDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EventResponseDto> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw ProblemDetailsException.badRequest(
        'Missing mandatory Idempotency-Key header for cancel command operation.',
        [{ name: 'Idempotency-Key', reason: 'Header is required' }],
      );
    }

    const expectedRevision = this.parseIfMatch(ifMatchHeader);
    const requestPath = req.originalUrl || req.url;
    return await this.respondOnce(claims, idempotencyKey, requestPath, 'cancel', { ...dto, expectedRevision }, async () => {
      const result = await this.eventsService.cancelEvent(claims, id, expectedRevision, dto, idempotencyKey);
      return { statusCode: HttpStatus.OK, headers: { ETag: `"${result.revision_number}"`, 'Content-Type': 'application/json' }, body: result };
    }, res);
  }

  @Post(':id/archives')
  @RequireScopes('events:write')
  async archiveEvent(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Headers('if-match') ifMatchHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EventResponseDto> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw ProblemDetailsException.badRequest(
        'Missing mandatory Idempotency-Key header for archive command operation.',
        [{ name: 'Idempotency-Key', reason: 'Header is required' }],
      );
    }

    const expectedRevision = this.parseIfMatch(ifMatchHeader);
    const requestPath = req.originalUrl || req.url;
    return await this.respondOnce(claims, idempotencyKey, requestPath, 'archive', { expectedRevision }, async () => {
      const result = await this.eventsService.archiveEvent(claims, id, expectedRevision, {}, idempotencyKey);
      return { statusCode: HttpStatus.OK, headers: { ETag: `"${result.revision_number}"`, 'Content-Type': 'application/json' }, body: result };
    }, res);
  }

  @Get(':id/revisions')
  @RequireScopes('events:write', 'events:read')
  async getRevisions(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
  ) {
    return await this.eventsService.getRevisions(claims, id);
  }

  @Post(':id/assignments')
  @RequireScopes('events:write')
  async createAssignment(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateAssignmentDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AssignmentResponseDto> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw ProblemDetailsException.badRequest(
        'Missing mandatory Idempotency-Key header for assignment command operation.',
        [{ name: 'Idempotency-Key', reason: 'Header is required' }],
      );
    }

    const requestPath = req.originalUrl || req.url;
    return await this.respondOnce(claims, idempotencyKey, requestPath, 'assign', dto, async () => {
      const result = await this.eventsService.createAssignment(claims, id, dto, idempotencyKey);
      return { statusCode: HttpStatus.CREATED, headers: { 'Content-Type': 'application/json' }, body: result };
    }, res);
  }

  @Get(':id/assignments')
  @RequireScopes('events:write', 'events:read')
  async listAssignments(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
  ): Promise<AssignmentResponseDto[]> {
    return await this.eventsService.listAssignments(claims, id);
  }

  @Delete(':id/assignments/:assignment_id')
  @RequireScopes('events:write')
  async revokeAssignment(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Param('assignment_id') assignmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AssignmentResponseDto> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw ProblemDetailsException.badRequest(
        'Missing mandatory Idempotency-Key header for assignment revocation operation.',
        [{ name: 'Idempotency-Key', reason: 'Header is required' }],
      );
    }

    const requestPath = req.originalUrl || req.url;
    return await this.respondOnce(claims, idempotencyKey, requestPath, 'revoke-assignment', { assignmentId, action: 'REVOKE' }, async () => {
      const result = await this.eventsService.revokeAssignment(claims, id, assignmentId, idempotencyKey);
      return { statusCode: HttpStatus.OK, headers: { 'Content-Type': 'application/json' }, body: result };
    }, res);
  }

  @Get(':id/audit')
  @RequireScopes('events:read', 'events:write')
  async getAuditTrail(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
  ): Promise<AuditResponseDto[]> {
    return await this.eventsService.getAuditTrail(claims, id);
  }

  @Get(':id/history')
  @RequireScopes('events:read', 'events:write')
  async getEventHistory(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
  ): Promise<EventHistoryResponseDto> {
    return await this.eventsService.getEventHistory(claims, id);
  }
}

