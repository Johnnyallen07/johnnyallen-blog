import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScoreAnnotationDto } from './score-annotation.dto';
import { ScorePageDto } from './score-page.dto';

export class UpdateMusicScoreDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ScoreAnnotationDto)
  annotations?: ScoreAnnotationDto[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  composer?: string | null;

  @IsOptional()
  @IsString()
  instrument?: string;

  /** 图片乐谱：整组页面（顺序即展示顺序），被移除的页面会从 COS 删除 */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScorePageDto)
  pages?: ScorePageDto[];

  @IsOptional()
  @IsString()
  fileKey?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @IsOptional()
  @IsNumber()
  pageCount?: number;

  @IsOptional()
  @IsString()
  coverUrl?: string;
}
