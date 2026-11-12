import { EventRevisionEntity } from '../../domain/models/event-revision.entity';
import { EventHistoryOutput } from '../../application/ports/event-contracts.port';
import { AuditResponseDto } from './audit-response.dto';

export class EventHistoryResponseDto implements EventHistoryOutput {
  event_id!: string;
  organization_id!: string;
  current_revision!: number;
  revisions!: EventRevisionEntity[];
  audit_trail!: AuditResponseDto[];
}

