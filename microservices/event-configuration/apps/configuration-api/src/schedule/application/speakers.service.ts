import { Inject, Injectable } from '@nestjs/common';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { DomainException } from '../../shared/errors/domain.exception';
import { TENANT_TRANSACTION, TenantTransaction } from '../../shared/application/tenant-transaction.port';
import { AuditContext } from '../domain/ports/schedule-repository.port';
import { SPEAKER_REPOSITORY, SpeakerPatch, SpeakerRepositoryPort, SpeakerWrite } from '../domain/ports/speaker-repository.port';
import { CONSENT_NOTICE_READER, ConsentNoticeReader } from './ports/consent-notice-reader.port';

@Injectable()
export class SpeakersService {
  constructor(
    @Inject(SPEAKER_REPOSITORY) private readonly repository: SpeakerRepositoryPort,
    @Inject(TENANT_TRANSACTION) private readonly transaction: TenantTransaction,
    @Inject(CONSENT_NOTICE_READER) private readonly notices: ConsentNoticeReader,
  ) {}

  getConsentNotice() {
    const notice = this.notices.getNotice();
    if (!notice) throw new DomainException({
      type: 'urn:problem:service-unavailable', title: 'Service Unavailable', status: 503,
      detail: 'Speaker consent notice is not configured.', code: 'consent_notice_unavailable',
    });
    return notice;
  }

  list(claims: TenantClaims, limit: number, cursor?: string) {
    return this.repository.list(claims.organization_id, limit, cursor);
  }

  async get(claims: TenantClaims, id: string) {
    const speaker = await this.repository.findActive(claims.organization_id, id);
    if (!speaker) throw DomainException.notFound('Speaker was not found.', 'speaker_not_found');
    return speaker;
  }

  async create(claims: TenantClaims, input: SpeakerWrite) {
    const consent = this.validateConsent(input.public_consent, input.public_consent_version);
    return this.transaction.withTenantTransaction(claims.organization_id, async () => {
      const speaker = await this.repository.insert(claims.organization_id, claims.sub, input, consent);
      await this.repository.appendAudit(claims.organization_id, this.actor(claims), speaker.id, 'created', 1, { display_name: speaker.display_name });
      if (input.public_consent) await this.repository.appendConsent(claims.organization_id, claims.sub, speaker.id, true, consent!);
      return speaker;
    });
  }

  async update(claims: TenantClaims, id: string, revision: number, input: SpeakerPatch) {
    if (!Object.keys(input).length) throw DomainException.badRequest('At least one field is required.');
    const consent = input.public_consent === undefined ? undefined : this.validateConsent(input.public_consent, input.public_consent_version);
    return this.transaction.withTenantTransaction(claims.organization_id, async () => {
      const current = await this.repository.findActive(claims.organization_id, id);
      if (!current) throw DomainException.notFound('Speaker was not found.', 'speaker_not_found');
      if (current.revision !== revision) throw DomainException.preconditionFailed('Speaker revision is stale.');
      if (input.exclusive === false && await this.repository.hasActiveReservation(claims.organization_id, id)) {
        throw DomainException.conflict('Speaker has active reservations.', 'resource_in_use');
      }
      const speaker = await this.repository.update(claims.organization_id, claims.sub, id, revision, input, consent);
      if (!speaker) throw DomainException.preconditionFailed('Speaker revision changed during update.');
      const action = input.public_consent === undefined ? 'updated' : input.public_consent ? 'consent_accepted' : 'consent_revoked';
      await this.repository.appendAudit(claims.organization_id, this.actor(claims), id, action, speaker.revision, { fields: Object.keys(input), consent_version: consent ?? null });
      if (input.public_consent !== undefined) {
        await this.repository.appendConsent(claims.organization_id, claims.sub, id, input.public_consent, consent ?? current.public_consent_version ?? 'revoked');
      }
      return speaker;
    });
  }

  async archive(claims: TenantClaims, id: string, revision: number) {
    return this.transaction.withTenantTransaction(claims.organization_id, async () => {
      if (await this.repository.hasActiveReservation(claims.organization_id, id)) {
        throw DomainException.conflict('Speaker has active reservations.', 'resource_in_use');
      }
      if (!await this.repository.archive(claims.organization_id, claims.sub, id, revision)) {
        throw DomainException.preconditionFailed('Speaker revision changed before archive.');
      }
      await this.repository.appendAudit(claims.organization_id, this.actor(claims), id, 'archived', revision + 1, {});
    });
  }

  private validateConsent(accepted: boolean, version?: string): string | null {
    if (!accepted) {
      if (version !== undefined) throw DomainException.unprocessable('Do not send a notice version when consent is false.');
      return null;
    }
    const notice = this.getConsentNotice();
    if (!version || version !== notice.version) throw DomainException.unprocessable('Consent notice version is stale or invalid.');
    return version;
  }

  private actor(claims: TenantClaims): AuditContext {
    return { actorId: claims.sub, actorRoles: claims.roles, requestId: claims.request_id, clientIp: claims.client_ip, userAgent: claims.user_agent };
  }
}
