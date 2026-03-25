import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/** A single reference file (image or PDF) as base64 */
export class ReferenceFileDto {
  @IsString()
  mimeType: string; // e.g. "image/png", "application/pdf"

  @IsString()
  data: string; // base64-encoded file content (NO data:xxx;base64, prefix)

  @IsString()
  @IsOptional()
  fileName?: string;
}

export class GenerateLatexDto {
  @IsString()
  subject: string;

  @IsString()
  examType: string;

  @IsString()
  topic: string;

  @IsString()
  difficulty: string;

  @IsInt()
  @Min(1)
  @Max(20)
  count: number;

  @IsString()
  @IsOptional()
  referenceQuestions?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceFileDto)
  @IsOptional()
  referenceFiles?: ReferenceFileDto[];
}

export class ChatLatexDto {
  @IsString()
  sessionId: string;

  @IsString()
  message: string;
}

export class UploadPdfDto {
  @IsString()
  sessionId: string;

  @IsString()
  fileName: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
