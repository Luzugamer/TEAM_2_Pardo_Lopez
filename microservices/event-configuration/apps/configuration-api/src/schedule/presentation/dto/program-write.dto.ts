import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgramWriteDto {
  @ApiProperty({ maxLength: 100, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ minLength: 1, maxLength: 180 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ maxLength: 3000 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  display_order!: number;

  @ApiPropertyOptional({ pattern: '^#[0-9A-Fa-f]{6}$' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;
}
