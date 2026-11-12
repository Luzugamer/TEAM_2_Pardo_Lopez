import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
export class CreateFormDto {
  @ApiProperty({ maxLength: 180 }) @IsString() @MinLength(1) @MaxLength(180) name!: string;
  @ApiProperty({ enum: ['registration','application','feedback'] }) @IsIn(['registration','application','feedback']) purpose!: string;
}
export class FormVersionDto {
  @ApiProperty({ type: Object }) @IsObject() schema!: Record<string, unknown>;
  @ApiProperty({ type: Object }) @IsObject() ui_schema!: Record<string, unknown>;
  @ApiProperty({ type: Object }) @IsObject() consent!: Record<string, unknown>;
  @ApiProperty({ type: Object }) @IsObject() field_policies!: Record<string, unknown>;
}
export class PublishFormDto { @ApiProperty({ minLength: 64, maxLength: 64 }) @IsString() @MinLength(64) @MaxLength(64) expected_hash!: string; }
export class CreateBindingDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('all') form_version_id!: string;
  @ApiProperty({ enum: ['registration','application','feedback'] }) @IsIn(['registration','application','feedback']) purpose!: string;
  @ApiProperty({ enum: ['scheduled','open'] }) @IsIn(['scheduled','open']) status!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) opens_at!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) closes_at!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('all') replace_binding_id?: string;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) replace_revision?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(500) replace_reason?: string;
}
export class CloseBindingDto { @ApiProperty({ maxLength: 500 }) @IsString() @MinLength(1) @MaxLength(500) reason!: string; }
