import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSeriesDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  emoji?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsBoolean()
  @IsOptional()
  published?: boolean;

  @IsBoolean()
  @IsOptional()
  withDefaults?: boolean;

  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  authorId: string;
}
