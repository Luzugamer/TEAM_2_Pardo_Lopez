import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the preceding page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('all') program_id?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('all') venue_id?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString({ strict: true }) starts_after?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString({ strict: true }) ends_before?: string;
}
