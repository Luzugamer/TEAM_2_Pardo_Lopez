import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpeakerWriteDto {
  @ApiProperty({ minLength: 1, maxLength: 180 }) @IsString() @MinLength(1) @MaxLength(180) display_name!: string;
  @ApiPropertyOptional({ maxLength: 5000 }) @IsOptional() @IsString() @MaxLength(5000) bio?: string | null;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) media_ref?: string | null;
  @ApiProperty() @IsBoolean() public_consent!: boolean;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) public_consent_version?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exclusive?: boolean;
}

export class SpeakerPatchDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 180 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(180) display_name?: string;
  @ApiPropertyOptional({ maxLength: 5000 }) @IsOptional() @IsString() @MaxLength(5000) bio?: string | null;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) media_ref?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() public_consent?: boolean;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) public_consent_version?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exclusive?: boolean;
}
