import { IsString, IsOptional } from 'class-validator';

export class CreateSidebarEntityDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;
}
