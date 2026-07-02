import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TranslateContentItemDto {
  @IsString()
  entityType: string;

  @IsString()
  entityId: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  fields?: string[];
}

export class TranslateRequestDto {
  @IsString()
  targetLocale: string;

  /** 单次最多 25 条 UI 文案（客户端分片循环以显示进度） */
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(25)
  @IsOptional()
  uiMessageIds?: string[];

  /** 单次最多 1 个内容实体（正文可能很长） */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslateContentItemDto)
  @ArrayMaxSize(1)
  @IsOptional()
  content?: TranslateContentItemDto[];
}
