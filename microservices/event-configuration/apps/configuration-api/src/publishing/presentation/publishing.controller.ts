import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiSecurity } from '@nestjs/swagger';
import { EventsService } from '../../events/application/events.service';
import { ValidatePublicationDto } from '../../events/presentation/dto/validate-publication.dto';
import { CreateReleaseDto } from './dto/create-release.dto';
import { ReadinessReportDto } from './dto/readiness-report.dto';
import { ReleaseEntity } from '../domain/models/release.entity';
import { ReleaseManifest } from '../domain/models/release-manifest.interface';
import { ReleaseAssemblerService } from '../application/release-assembler.service';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { Claims } from '../../shared/auth/claims.decorator';
import { RequireScopes } from '../../shared/auth/scopes.decorator';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { CachedResponse, IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { ProblemDetailsException } from '../../shared/errors/problem-details.exception';

@Controller('events')
@UseGuards(AuthGuard)
@ApiSecurity('DevActor')
export class PublishingController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly releaseAssembler: ReleaseAssemblerService,
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
      claims.organization_id,
      claims.sub,
      operation,
      key,
      requestPath,
      payload,
      command,
    );
    for (const [name, value] of Object.entries(response.headers)) {
      res.setHeader(name, value);
    }
    res.status(response.statusCode);
    return response.body as T;
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

  @Post(':id/publication-validations')
  @RequireScopes('events:publish')
  async validatePublication(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Body() dto: ValidatePublicationDto,
  ): Promise<ReadinessReportDto> {
    return await this.releaseAssembler.validateReadiness(
      {
        organization_id: claims.organization_id,
        event_id: id,
        expected_event_revision: dto.expected_event_revision,
        effective_at: new Date().toISOString(),
      },
      claims,
    );
  }

  @Post(':id/releases')
  @RequireScopes('events:publish')
  async createRelease(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Headers('if-match') ifMatchHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateReleaseDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReleaseEntity> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw ProblemDetailsException.badRequest(
        'Missing mandatory Idempotency-Key header for release creation command.',
        [{ name: 'Idempotency-Key', reason: 'Header is required' }],
      );
    }

    const expectedRevision = this.parseIfMatch(ifMatchHeader);
    if (expectedRevision !== dto.expected_event_revision) {
      throw ProblemDetailsException.preconditionFailed(
        'If-Match and expected_event_revision must identify the same event revision.',
        'stale_revision',
      );
    }
    const requestPath = req.originalUrl || req.url;
    return await this.respondOnce(
      claims,
      idempotencyKey,
      requestPath,
      'release',
      { ...dto, expectedRevision },
      async () => {
        const result = await this.releaseAssembler.publishRelease(
          {
            organization_id: claims.organization_id,
            event_id: id,
            expected_event_revision: expectedRevision,
            effective_at: dto.effective_at || new Date().toISOString(),
          },
          claims,
          idempotencyKey,
        );
        return {
          statusCode: HttpStatus.CREATED,
          headers: {
            ETag: `"${result.event_revision_number}"`,
            'Content-Type': 'application/json',
          },
          body: result,
        };
      },
      res,
    );
  }

  @Get(':id/releases')
  @RequireScopes('events:write', 'events:read')
  async listReleases(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
  ): Promise<ReleaseEntity[]> {
    await this.eventsService.getEventById(claims, id);
    return await this.releaseAssembler.listReleases(claims.organization_id, id);
  }

  @Get(':id/releases/:release_id')
  @RequireScopes('events:write', 'events:read')
  async getReleaseById(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Param('release_id') releaseId: string,
  ): Promise<ReleaseEntity> {
    await this.eventsService.getEventById(claims, id);
    const release = await this.releaseAssembler.getReleaseById(claims.organization_id, releaseId);
    if (release.event_id !== id) {
      throw ProblemDetailsException.notFound('Release not found for event.', 'RELEASE_NOT_FOUND');
    }
    return release;
  }

  @Get(':id/releases/:release_id/manifest')
  @RequireScopes('events:write', 'events:read')
  async getReleaseManifest(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Param('release_id') releaseId: string,
  ): Promise<ReleaseManifest> {
    const release = await this.getReleaseById(claims, id, releaseId);
    return release.manifest;
  }

  @Get(':id/releases/:release_id/manifest/artifacts/:kind')
  @RequireScopes('events:write', 'events:read')
  async getReleaseArtifact(
    @Claims() claims: TenantClaims,
    @Param('id') id: string,
    @Param('release_id') releaseId: string,
    @Param('kind') kind: string,
  ) {
    await this.getReleaseById(claims, id, releaseId);
    const artifacts = await this.releaseAssembler.getReleaseArtifacts(
      claims.organization_id,
      releaseId,
    );
    const artifact = artifacts.find((item) => item.kind === kind);
    if (!artifact) {
      throw ProblemDetailsException.notFound('Release artifact not found.', 'ARTIFACT_NOT_FOUND');
    }
    return artifact;
  }
}
