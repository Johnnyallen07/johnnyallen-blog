import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScorePageDto } from './score-page.dto';

export class CreateMusicScoreDto {
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
