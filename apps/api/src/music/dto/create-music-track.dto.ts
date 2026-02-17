import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateMusicTrackDto {
  @IsString()
  title: string;

  @IsString()
  musician: string;

  @IsString()
  performer: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  series?: string;

  @IsNumber()
  duration: number;

  @IsString()
  fileKey: string;

  @IsString()
  fileUrl: string;

  @IsNumber()
  fileSize: number;

  @IsOptional()
  @IsString()
  coverUrl?: string;
}
