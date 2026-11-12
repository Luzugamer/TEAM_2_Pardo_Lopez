import { AssignmentEntity } from '../models/assignment.entity';
import { AuditEntity } from '../models/audit.entity';
import { EventEntity } from '../models/event.entity';
import { EventRevisionEntity } from '../models/event-revision.entity';
import { EventStatus } from '../models/event-status.enum';

export const EVENTS_REPOSITORY = Symbol('EVENTS_REPOSITORY');

export interface AuditRecordInput {
  id?: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
  actor_roles: string[];
  request_id?: string;
  idempotency_key?: string;
  revision_number?: number;
  diff?: Record<string, unknown> | null;
  payload_hash?: string;
  client_ip?: string;
  user_agent?: string;
  created_at?: string;
}

export interface OutboxRecordInput {
  id?: string;
  organization_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  headers?: Record<string, unknown>;
  status?: 'pending' | 'delivered' | 'failed';
}

export interface EventsQuery {
  site_id?: string;
  kind?: string;
  status?: EventStatus;
  from_date?: string;
  to_date?: string;
  limit?: number;
  cursor?: string;
}

export interface EventsRepositoryPort {
  findById(organizationId: string, eventId: string): Promise<EventEntity | null>;
  findBySlug(organizationId: string, siteId: string, slug: string): Promise<EventEntity | null>;
  createEvent(event: EventEntity, revision: EventRevisionEntity, audit: AuditRecordInput): Promise<EventEntity>;
  listEvents(organizationId: string, query: EventsQuery): Promise<{ items: EventEntity[]; hasNextPage: boolean; nextCursor: string | null }>;
  updateEventWithRevision(organizationId: string, eventId: string, expectedRevision: number, updatedEvent: Partial<EventEntity>, newRevision: EventRevisionEntity, audit: AuditRecordInput, outbox?: OutboxRecordInput): Promise<EventEntity>;
  getRevisions(organizationId: string, eventId: string): Promise<EventRevisionEntity[]>;
  createAssignment(assignment: AssignmentEntity, audit: AuditRecordInput): Promise<AssignmentEntity>;
  findAssignmentById(organizationId: string, assignmentId: string): Promise<AssignmentEntity | null>;
  listAssignments(organizationId: string, eventId: string): Promise<AssignmentEntity[]>;
  revokeAssignment(organizationId: string, assignmentId: string, audit: AuditRecordInput): Promise<AssignmentEntity>;
  hasActiveAssignment(organizationId: string, eventId: string, userId: string, requiredScope: string, atDate?: Date): Promise<boolean>;
  getAuditTrail(organizationId: string, eventId: string): Promise<AuditEntity[]>;
}
