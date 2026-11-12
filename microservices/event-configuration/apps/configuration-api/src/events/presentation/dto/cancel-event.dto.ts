import { IsString, IsNotEmpty, MaxLength, IsISO8601 } from 'class-validator';
import { CancelEventInput } from '../../application/ports/event-contracts.port';

export class CancelEventDto implements CancelEventInput {
  @IsString()
  @IsNotEmpty({ message: 'Cancellation reason is required' })
  @MaxLength(500, { message: 'Cancellation reason cannot exceed 500 characters' })
  reason!: string;

  @IsISO8601({}, { message: 'effective_at must be a valid ISO 8601 date-time' })
  effective_at!: string;
}

