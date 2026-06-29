import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateMusicScoreDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  composer?: string | null;

  @IsString()
  instrument: string;

  @IsString()
  fileKey: string;

  @IsString()
  fileUrl: string;

  @IsNumber()
  fileSize: number;

  @IsNumber()
  pageCount: number;

  @IsOptional()
  @IsString()
  coverUrl?: string;
}
