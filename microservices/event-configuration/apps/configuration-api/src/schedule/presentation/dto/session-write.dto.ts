import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  ArrayUnique,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionWriteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  program_id!: string;

  @ApiProperty({ minLength: 1, maxLength: 220 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  title!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  starts_at!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  ends_at!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  venue_id!: string;

  @ApiPropertyOptional({ type: [String], maxItems: 50, uniqueItems: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  @ArrayUnique()
  speaker_ids?: string[];
}

export class ScheduleSessionDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expected_event_revision!: number;
}
