import { TenantClaims } from '../../../shared/auth/tenant-claims.interface';
import { EventEntity } from '../models/event.entity';

export const EVENT_LIFECYCLE_PUBLISHER = Symbol('EVENT_LIFECYCLE_PUBLISHER');

export interface EventLifecyclePublisherPort {
  runInUnitOfWork<T>(organizationId: string, work: () => Promise<T>): Promise<T>;
  recordClosureRelease(
    claims: TenantClaims,
    closedEvent: EventEntity,
    effectiveAt?: string,
    idempotencyKey?: string,
  ): Promise<unknown>;
  recordCancellationRelease(
    claims: TenantClaims,
    cancelledEvent: { id: string; revision_number: number },
    publicationId: string,
    effectiveAt?: string,
  ): Promise<unknown>;
}
