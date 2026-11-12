import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { Claims } from '../../shared/auth/claims.decorator';
import { RequireScopes } from '../../shared/auth/scopes.decorator';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { ProblemDetailsException } from '../../shared/errors/problem-details.exception';
import { SpeakerPatchDto, SpeakerWriteDto } from './dto/speaker.dto';
import { SpeakersService } from '../application/speakers.service';

@ApiTags('Schedule - EC-B')
@UseGuards(AuthGuard)
@RequireScopes('events:write')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
@Controller()
export class SpeakersController {
  constructor(private readonly service: SpeakersService, private readonly idempotency: IdempotencyService) {}

  @Get('speakers/consent-notice')
  getNotice() { return this.service.getConsentNotice(); }

  @Get('speakers')
  list(@Claims() claims: TenantClaims, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const parsed = limit === undefined ? 20 : Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw ProblemDetailsException.badRequest('limit must be an integer from 1 to 100.');
    return this.service.list(claims, parsed, cursor);
  }

  @Post('speakers')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(@Claims() claims: TenantClaims, @Body() dto: SpeakerWriteDto, @Headers('idempotency-key') key: string, @Res() response: Response) {
    const validKey = this.requireKey(key);
    const result = await this.idempotency.executeOnce(claims.organization_id, claims.sub, 'schedule.create.speaker', validKey, '/configuration/v1/speakers', dto, async () => {
      const speaker = await this.service.create(claims, dto);
      return { statusCode: 201, headers: { ETag: `"${speaker.revision}"` }, body: speaker };
    });
    for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
    response.status(result.statusCode).json(result.body);
  }

  @Get('speakers/:id')
  get(@Claims() claims: TenantClaims, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(claims, id); }

  @Patch('speakers/:id')
  async update(@Claims() claims: TenantClaims, @Param('id', ParseUUIDPipe) id: string, @Headers('if-match') tag: string, @Body() dto: SpeakerPatchDto, @Res() response: Response) {
    const speaker = await this.service.update(claims, id, this.revision(tag), dto);
    response.setHeader('ETag', `"${speaker.revision}"`).status(200).json(speaker);
  }

  @Delete('speakers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Claims() claims: TenantClaims, @Param('id', ParseUUIDPipe) id: string, @Headers('if-match') tag: string) {
    await this.service.archive(claims, id, this.revision(tag));
  }

  private requireKey(value?: string) {
    if (!value || value.trim().length < 16 || value.length > 128) throw ProblemDetailsException.badRequest('A valid Idempotency-Key header is required.');
    return value.trim();
  }

  private revision(value?: string) {
    if (!value) throw ProblemDetailsException.preconditionRequired();
    const revision = Number(value.trim().replace(/^W\//, '').replace(/^"|"$/g, ''));
    if (!Number.isSafeInteger(revision) || revision < 1) throw ProblemDetailsException.badRequest('If-Match must contain a positive revision.');
    return revision;
  }
}
