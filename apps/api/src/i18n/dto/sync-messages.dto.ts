import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SyncMessageItemDto {
  @IsString()
  namespace: string;

  @IsString()
  key: string;

  @IsString()
  sourceText: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  locations?: string[];
}

export class SyncMessagesDto {
  @IsIn(['web', 'music'])
  app: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncMessageItemDto)
  messages: SyncMessageItemDto[];
}
