import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ArchiveEventInput } from '../../application/ports/event-contracts.port';

export class ArchiveEventDto implements ArchiveEventInput {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

