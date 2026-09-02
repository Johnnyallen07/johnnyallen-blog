import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMimeType,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MomentLoginDto {
  @IsString() @IsNotEmpty() @MaxLength(100) username: string;
  @IsString() @IsNotEmpty() @MaxLength(200) password: string;
  @IsString() @IsNotEmpty() @MaxLength(40) code: string;
  @IsOptional() @IsBoolean() rememberDevice = true;
}

export class TotpCodeDto {
  @IsString() @IsNotEmpty() @MaxLength(40) code: string;
}

export class CreateMomentCategoryDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) order?: number;
}

export class UpdateMomentCategoryDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) order?: number;
}

export class UpdateMomentAssetDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) originalName?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
  @IsOptional() @IsIn(['PUBLIC', 'PRIVATE']) visibility?: 'PUBLIC' | 'PRIVATE';
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsIn(['READY', 'ARCHIVED']) status?: 'READY' | 'ARCHIVED';
  @IsOptional() @IsDateString() capturedAt?: string | null;
}

export class MomentBrowserQueryDto {
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  trash = false;
}

export class MoveMomentAssetDto {
  @IsOptional() @IsString() folderId?: string | null;
}

export class MomentCatalogQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['photo', 'video', 'file']) type?:
    | 'photo'
    | 'video'
    | 'file';
  @IsOptional() @IsIn(['all', 'public', 'private']) visibility?:
    | 'all'
    | 'public'
    | 'private';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 48;
}

export class CreateSyncTokenDto {
  @IsString() @IsNotEmpty() @MaxLength(80) label: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreateUploadUrlDto {
  @IsString() @IsNotEmpty() @MaxLength(1024) relativePath: string;
  @IsString() @Matches(/^[a-fA-F0-9]{64}$/) checksum: string;
  @IsMimeType() mimeType: string;
  @Transform(({ value }) => String(value))
  @Matches(/^\d{1,20}$/)
  size: string;
}

export class CompleteSyncDto extends CreateUploadUrlDto {
  @IsString() @IsNotEmpty() objectKey: string;
  @IsOptional() @IsDateString() capturedAt?: string;
  @IsOptional() @IsInt() @Min(1) width?: number;
  @IsOptional() @IsInt() @Min(1) height?: number;
}
