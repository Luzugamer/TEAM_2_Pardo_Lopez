import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SessionWriteDto } from './session-write.dto';

export class ScheduleValidationDto {
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) expected_event_revision!: number;
  @ApiProperty({ type: [SessionWriteDto], maxItems: 500 }) @IsArray() @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => SessionWriteDto) candidate_sessions!: SessionWriteDto[];
}
