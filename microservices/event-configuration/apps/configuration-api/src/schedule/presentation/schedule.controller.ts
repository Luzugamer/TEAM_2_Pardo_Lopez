import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { Claims } from '../../shared/auth/claims.decorator';
import { RequireScopes } from '../../shared/auth/scopes.decorator';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { IdempotencyService, CachedResponse } from '../../shared/idempotency/idempotency.service';
import { ProblemDetailsException } from '../../shared/errors/problem-details.exception';
import { ListQueryDto } from './dto/list-query.dto';
import { ProgramWriteDto } from './dto/program-write.dto';
import { ScheduleSessionDto, SessionWriteDto } from './dto/session-write.dto';
import { VenueWriteDto } from './dto/venue-write.dto';
import { VenuePatchDto, ProgramPatchDto } from './dto/resource-patch.dto';
import { ScheduleValidationDto } from './dto/schedule-validation.dto';
import { ScheduleService } from '../application/schedule.service';

@ApiTags('Schedule - EC-B')
@ApiSecurity('DevActor')
@UseGuards(AuthGuard)
@RequireScopes('events:write')
@UsePipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
}))
@Controller()
export class ScheduleController {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get('venues')
  @ApiOperation({ summary: 'List active venues and rooms for the current organization.' })
  @ApiResponse({ status: 200, description: 'Tenant-scoped page of active venues.' })
  listVenues(@Claims() claims: TenantClaims, @Query() query: ListQueryDto) {
    return this.scheduleService.listVenues(claims, query);
  }

  @Post('venues')
  @ApiOperation({ summary: 'Create a venue or room.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 201, description: 'Venue created.' })
  async createVenue(
    @Claims() claims: TenantClaims,
    @Body() dto: VenueWriteDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    await this.respondOnce(claims, key, request, 'schedule.create.venue', dto, async () => {
      const venue = await this.scheduleService.createVenue(claims, dto, this.requestMetadata(claims, request, key));
      return this.cached(HttpStatus.CREATED, venue, venue.revision);
    }, response);
  }

  @Get('venues/:id')
  getVenue(@Claims() claims: TenantClaims, @Param('id', ParseUUIDPipe) id: string) { return this.scheduleService.getVenue(claims, id); }

  @Patch('venues/:id')
  async updateVenue(@Claims() claims: TenantClaims, @Param('id', ParseUUIDPipe) id: string, @Headers('if-match') tag: string | undefined,
    @Body() dto: VenuePatchDto, @Req() request: Request, @Res() response: Response): Promise<void> {
    const result = await this.scheduleService.updateVenue(claims, id, this.parseIfMatch(tag), dto, this.requestMetadata(claims, request, ''));
    response.setHeader('ETag', `"${result.revision}"`).status(200).json(result);
  }

  @Delete('venues/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveVenue(@Claims() claims: TenantClaims, @Param('id', ParseUUIDPipe) id: string, @Headers('if-match') tag: string | undefined, @Req() request: Request) {
    return this.scheduleService.archiveVenue(claims, id, this.parseIfMatch(tag), this.requestMetadata(claims, request, ''));
  }

  @Get('events/:eventId/programs')
  @ApiOperation({ summary: 'List active programs for an event.' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Programs sorted by display order.' })
  listPrograms(
    @Claims() claims: TenantClaims,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ListQueryDto,
  ) {
    return this.scheduleService.listPrograms(claims, eventId, query);
  }

  @Post('events/:eventId/programs')
  @ApiOperation({ summary: 'Create a program for an event.' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 201, description: 'Program created.' })
  async createProgram(
    @Claims() claims: TenantClaims,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ProgramWriteDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    try {
      await this.respondOnce(claims, key, request, 'schedule.create.program', dto, async () => {
        const program = await this.scheduleService.createProgram(
          claims,
          eventId,
          dto,
          this.requestMetadata(claims, request, key),
        );
        return this.cached(HttpStatus.CREATED, program, program.revision);
      }, response);
    } catch (error) {
      this.translateKnownDatabaseError(error);
    }
  }

  @Get('events/:eventId/programs/:programId')
  getProgram(@Claims() claims: TenantClaims, @Param('eventId', ParseUUIDPipe) eventId: string, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.scheduleService.getProgram(claims, eventId, programId);
  }

  @Patch('events/:eventId/programs/:programId')
  async updateProgram(@Claims() claims: TenantClaims, @Param('eventId', ParseUUIDPipe) eventId: string, @Param('programId', ParseUUIDPipe) programId: string,
    @Headers('if-match') tag: string | undefined, @Body() dto: ProgramPatchDto, @Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const result = await this.scheduleService.updateProgram(claims, eventId, programId, this.parseIfMatch(tag), dto, this.requestMetadata(claims, request, ''));
      response.setHeader('ETag', `"${result.revision}"`).status(200).json(result);
    } catch (error) { this.translateKnownDatabaseError(error); }
  }

  @Delete('events/:eventId/programs/:programId')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveProgram(@Claims() claims: TenantClaims, @Param('eventId', ParseUUIDPipe) eventId: string, @Param('programId', ParseUUIDPipe) programId: string,
    @Headers('if-match') tag: string | undefined, @Req() request: Request) {
    return this.scheduleService.archiveProgram(claims, eventId, programId, this.parseIfMatch(tag), this.requestMetadata(claims, request, ''));
  }

  @Get('events/:eventId/sessions')
  @ApiOperation({ summary: 'List event sessions in deterministic agenda order.' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tenant-scoped page of draft and scheduled sessions.' })
  listSessions(
    @Claims() claims: TenantClaims,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ListQueryDto,
  ) {
    return this.scheduleService.listSessions(claims, eventId, query);
  }

  @Post('events/:eventId/schedule-validations')
  @ApiOperation({ summary: 'Preview schedule conflicts and warnings without persisting or reserving resources.' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Validation result for candidate sessions.' })
  validateSchedule(
    @Claims() claims: TenantClaims,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ScheduleValidationDto,
  ) {
    return this.scheduleService.validateSchedule(claims, eventId, dto);
  }

  @Post('events/:eventId/sessions')
  @ApiOperation({ summary: 'Create a draft session; exclusive resources are not reserved yet.' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 201, description: 'Draft session created.' })
  async createDraftSession(
    @Claims() claims: TenantClaims,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SessionWriteDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    await this.respondOnce(claims, key, request, 'schedule.create.session', dto, async () => {
      const session = await this.scheduleService.createDraftSession(
        claims,
        eventId,
        dto,
        this.requestMetadata(claims, request, key),
      );
      return this.cached(HttpStatus.CREATED, session, session.revision);
    }, response);
  }

  @Post('events/:eventId/sessions/:sessionId/schedules')
  @ApiOperation({ summary: 'Schedule a draft session and reserve exclusive resources atomically.' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 200, description: 'Session scheduled.' })
  async scheduleSession(
    @Claims() claims: TenantClaims,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ScheduleSessionDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const expectedSessionRevision = this.parseIfMatch(ifMatch);
    const key = this.requireIdempotencyKey(idempotencyKey);
    try {
      await this.respondOnce(
        claims,
        key,
        request,
        'schedule.session.schedule',
        { eventId, sessionId, expectedSessionRevision, ...dto },
        async () => {
          const session = await this.scheduleService.scheduleSession(
            claims,
            eventId,
            sessionId,
            expectedSessionRevision,
            dto,
            this.requestMetadata(claims, request, key),
          );
          return this.cached(HttpStatus.OK, session, session.revision);
        },
        response,
      );
    } catch (error) {
      this.translateKnownDatabaseError(error);
    }
  }

  private async respondOnce(
    claims: TenantClaims,
    key: string,
    request: Request,
    operation: string,
    payload: unknown,
    command: () => Promise<CachedResponse>,
    response: Response,
  ): Promise<void> {
    const path = request.originalUrl || request.url;
    const result = await this.idempotencyService.executeOnce(
      claims.organization_id,
      claims.sub,
      operation,
      key,
      path,
      payload,
      command,
    );
    for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
    response.status(result.statusCode).json(result.body);
  }

  private cached(statusCode: number, body: unknown, revision: number): CachedResponse {
    return {
      statusCode,
      headers: { ETag: `"${revision}"`, 'Content-Type': 'application/json' },
      body,
    };
  }

  private requireIdempotencyKey(key: string | undefined): string {
    if (!key || key.trim().length < 16 || key.length > 128) {
      throw ProblemDetailsException.badRequest(
        'A valid Idempotency-Key header is required for this command.',
        [{ name: 'Idempotency-Key', reason: 'Provide a value with 16 to 128 characters.' }],
      );
    }
    return key.trim();
  }

  private parseIfMatch(header: string | undefined): number {
    if (!header?.trim()) throw ProblemDetailsException.preconditionRequired();
    const cleaned = header.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
    const revision = Number(cleaned);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw ProblemDetailsException.badRequest('If-Match must contain a positive revision ETag.', [
        { name: 'If-Match', reason: 'Use a quoted positive integer such as "1".' },
      ]);
    }
    return revision;
  }

  private requestMetadata(claims: TenantClaims, request: Request, idempotencyKey: string) {
    return {
      requestId: claims.request_id,
      idempotencyKey,
      clientIp: claims.client_ip,
      userAgent: claims.user_agent ?? request.header('user-agent'),
    };
  }

  private translateKnownDatabaseError(error: unknown): never {
    if (isPostgresError(error, '23505', 'uq_programs_org_event_slug')) {
      throw ProblemDetailsException.conflict('Program slug already exists for this event.', 'slug_already_exists');
    }
    throw error;
  }
}

function isPostgresError(error: unknown, code: string, constraint: string): boolean {
  return Boolean(error && typeof error === 'object'
    && 'code' in error && error.code === code
    && 'constraint' in error && error.constraint === constraint);
}
