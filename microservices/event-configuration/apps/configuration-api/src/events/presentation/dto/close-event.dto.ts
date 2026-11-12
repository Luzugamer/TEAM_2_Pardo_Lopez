import { IsString, IsNotEmpty, MaxLength, IsISO8601 } from 'class-validator';
import { CloseEventInput } from '../../application/ports/event-contracts.port';

export class CloseEventDto implements CloseEventInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsISO8601({}, { message: 'effective_at must be a valid ISO 8601 date-time' })
  effective_at!: string;
}

