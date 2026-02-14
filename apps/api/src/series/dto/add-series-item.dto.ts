import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AddSeriesItemDto {
  @IsUUID()
  @IsOptional()
  postId?: string;

  @IsString()
  @IsOptional()
  title?: string; // For folder nodes or overrides

  @IsUUID()
  @IsOptional()
  parentId?: string;
}
