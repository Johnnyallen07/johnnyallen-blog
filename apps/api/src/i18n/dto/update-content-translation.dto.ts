import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateContentTranslationDto {
  @IsString()
  locale: string;

  /** field → 译文；空字符串表示删除该字段翻译 */
  @IsObject()
  fields: Record<string, string>;

  @IsIn(['MACHINE', 'REVIEWED'])
  @IsOptional()
  status?: 'MACHINE' | 'REVIEWED';
}
