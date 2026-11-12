import { EventStatus } from '../../domain/models/event-status.enum';
import {
  EventListOutput,
  EventOutput,
  PageInfoOutput,
} from '../../application/ports/event-contracts.port';

export class EventResponseDto implements EventOutput {
  id!: string;
  organization_id!: string;
  site_id!: string;
  slug!: string;
  kind!: string;
  title!: string;
  description!: string | null;
  timezone!: string;
  starts_at!: string;
  ends_at!: string;
  status!: EventStatus;
  current_revision_id!: string | null;
  revision_number!: number;
  policy!: Record<string, unknown>;
  cancellation_reason!: string | null;
  metadata!: Record<string, unknown>;
  created_at!: string;
  updated_at!: string;
}

export class PageInfoDto implements PageInfoOutput {
  has_next_page!: boolean;
  next_cursor!: string | null;
}

export class EventListResponseDto implements EventListOutput {
  items!: EventResponseDto[];
  page_info!: PageInfoDto;
}

