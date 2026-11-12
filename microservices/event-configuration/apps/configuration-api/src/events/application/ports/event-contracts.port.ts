import { AssignmentEntity } from '../../domain/models/assignment.entity';
import { AuditEntity } from '../../domain/models/audit.entity';
import { EventEntity } from '../../domain/models/event.entity';
import { EventRevisionEntity } from '../../domain/models/event-revision.entity';

export interface CreateEventInput {
  site_id: string;
  slug: string;
  kind: string;
  title: string;
  description?: string;
  timezone: string;
  starts_at: string;
  ends_at: string;
  policy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateEventInput {
  slug?: string;
  kind?: string;
  title?: string;
  description?: string;
  timezone?: string;
  starts_at?: string;
  ends_at?: string;
  policy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  change_summary?: string;
}

export interface DuplicateEventInput {
  slug: string;
  starts_at: string;
  ends_at: string;
  site_id: string;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CancelEventInput {
  reason: string;
  effective_at: string;
}

export interface CloseEventInput {
  reason: string;
  effective_at: string;
}

export interface ArchiveEventInput {
  reason?: string;
}

export interface CreateAssignmentInput {
  user_id: string;
  role: string;
  scopes: string[];
  valid_from?: string;
  valid_to?: string;
  site_id?: string;
}

export type EventOutput = EventEntity;

export interface PageInfoOutput {
  has_next_page: boolean;
  next_cursor: string | null;
}

export interface EventListOutput {
  items: EventOutput[];
  page_info: PageInfoOutput;
}

export type AssignmentOutput = AssignmentEntity;

export type AuditOutput = AuditEntity;

export interface EventHistoryOutput {
  event_id: string;
  organization_id: string;
  current_revision: number;
  revisions: EventRevisionEntity[];
  audit_trail: AuditOutput[];
}
