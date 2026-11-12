import { EventStatus } from '../../../events/domain/models/event-status.enum';

export interface PublicationContext {
  organization_id: string;
  event_id: string;
  expected_event_revision: number;
  effective_at: string;
  target_status?: EventStatus.PUBLISHED | EventStatus.CLOSED | EventStatus.CANCELLED;
  /** Internal event snapshot fields copied by the owner (Events) for provider consistency. */
  event_timezone?: string;
  event_starts_at?: string;
  event_ends_at?: string;
}

