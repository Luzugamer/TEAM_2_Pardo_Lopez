import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VenueLocationDto } from './venue-write.dto';

export class VenuePatchDto {
  @ApiPropertyOptional({ enum: ['venue', 'room'] }) @IsOptional() @IsIn(['venue', 'room']) kind?: 'venue'|'room';
  @ApiPropertyOptional({ maxLength: 180 }) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) name?: string;
  @ApiPropertyOptional({ type: VenueLocationDto }) @IsOptional() @IsObject() @ValidateNested() @Type(() => VenueLocationDto) location?: VenueLocationDto;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacity?: number|null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exclusive?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() accessibility?: string[];
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('all') parent_venue_id?: string|null;
}

export class ProgramPatchDto {
  @ApiPropertyOptional({ maxLength: 100 }) @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(100) slug?: string;
  @ApiPropertyOptional({ maxLength: 180 }) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) name?: string;
  @ApiPropertyOptional({ maxLength: 3000 }) @IsOptional() @IsString() @MaxLength(3000) description?: string|null;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) display_order?: number;
  @ApiPropertyOptional({ pattern: '^#[0-9A-Fa-f]{6}$' }) @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string|null;
}
