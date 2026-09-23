import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScoreAnnotationDto } from './score-annotation.dto';
import { ScorePageDto } from './score-page.dto';

export class CreateMusicScoreDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ScoreAnnotationDto)
  annotations?: ScoreAnnotationDto[];

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  composer?: string | null;

  @IsString()
  instrument: string;

  @IsOptional()
  @IsIn(['pdf', 'images'])
  fileType?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScorePageDto)
  pages?: ScorePageDto[];

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
