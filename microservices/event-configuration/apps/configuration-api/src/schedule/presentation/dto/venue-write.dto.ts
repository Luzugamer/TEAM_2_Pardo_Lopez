import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VenueLocationDto {
  @ApiProperty({ minLength: 1, maxLength: 240 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  address!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  locality?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiPropertyOptional({ pattern: '^[A-Z]{2}$' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  country_code?: string;

  @ApiPropertyOptional({ maxLength: 24 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(24)
  postal_code?: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class VenueWriteDto {
  @ApiProperty({ enum: ['venue', 'room'] })
  @IsIn(['venue', 'room'])
  kind!: 'venue' | 'room';

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for kind=room.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID('all')
  parent_venue_id?: string;

  @ApiProperty({ minLength: 1, maxLength: 180 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @ApiProperty({ type: VenueLocationDto })
  @IsObject()
  @ValidateNested()
  @Type(() => VenueLocationDto)
  location!: VenueLocationDto;

  @ApiPropertyOptional({ minimum: 1 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiProperty()
  @IsBoolean()
  exclusive!: boolean;

  @ApiPropertyOptional({ type: [String], maxItems: 40 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  accessibility?: string[];
}
