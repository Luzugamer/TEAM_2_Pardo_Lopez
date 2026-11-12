import { EventEntity } from '../../../events/domain/models/event.entity';
import { EventRevisionEntity } from '../../../events/domain/models/event-revision.entity';
import { EventLifecyclePublisherPort } from '../../../events/domain/ports/event-lifecycle-publisher.port';
import { AuditRecordInput, OutboxRecordInput } from '../../../events/domain/ports/events-repository.port';
import { TenantClaims } from '../../../shared/auth/tenant-claims.interface';
import { ReleaseEntity, ReleaseArtifactEntity } from '../../domain/models/release.entity';

export const PUBLICATION_EVENTS = Symbol('PUBLICATION_EVENTS');
export const PUBLICATION_REPOSITORY = Symbol('PUBLICATION_REPOSITORY');
export const PUBLICATION_UNIT_OF_WORK = Symbol('PUBLICATION_UNIT_OF_WORK');

export interface PublicationEvents {
  getEventById(claims: TenantClaims, eventId: string): Promise<EventEntity>;
  readEventSnapshot(organizationId: string, eventId: string, expectedRevision?: number): Promise<{ snapshot: EventEntity; hash: string }>;
  setLifecyclePublisher?(publisher: EventLifecyclePublisherPort): void;
}
export interface PublicationRepository {
  getNextReleaseVersion(organizationId: string, eventId: string): Promise<number>;
  saveAtomicRelease(organizationId: string, release: ReleaseEntity, artifacts: ReleaseArtifactEntity[], outboxEntry: OutboxRecordInput, auditEntry: AuditRecordInput, updatedEvent: Partial<EventEntity>, revision: EventRevisionEntity, expectedRevision: number): Promise<ReleaseEntity>;
  saveClosureRelease(organizationId: string, release: ReleaseEntity, artifacts: ReleaseArtifactEntity[], outboxEntry: OutboxRecordInput, auditEntry: AuditRecordInput): Promise<ReleaseEntity>;
  listReleasesByEvent(organizationId: string, eventId: string): Promise<ReleaseEntity[]>;
  saveCancellationRelease(organizationId: string, release: ReleaseEntity, artifacts: ReleaseArtifactEntity[]): Promise<void>;
  findReleaseById(organizationId: string, releaseId: string): Promise<ReleaseEntity | null>;
  getReleaseArtifacts(organizationId: string, releaseId: string): Promise<ReleaseArtifactEntity[]>;
}
export interface PublicationUnitOfWork {
  run<T>(organizationId: string, work: () => Promise<T>): Promise<T>;
}
