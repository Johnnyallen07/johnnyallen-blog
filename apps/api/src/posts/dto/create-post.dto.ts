import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  title: string;

  @IsString()
  slug: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  excerpt?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsBoolean()
  @IsOptional()
  published?: boolean;

  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @IsUUID()
  categoryId: string;

  @IsString()
  authorId: string;
}
