import { IsString, IsOptional, IsNumber } from 'class-validator';

/** 图片乐谱的单页（按数组顺序展示） */
export class ScorePageDto {
  @IsString()
  key: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsNumber()
  size?: number;
}
