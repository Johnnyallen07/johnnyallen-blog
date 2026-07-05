import {
  IsString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScoreUploadFileDto {
  @IsString()
  fileName: string;

  @IsString()
  contentType: string;
}

/** 批量申请预签名上传 URL（图片乐谱一次传多页） */
export class CreateScoreUploadUrlsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScoreUploadFileDto)
  files: ScoreUploadFileDto[];
}
