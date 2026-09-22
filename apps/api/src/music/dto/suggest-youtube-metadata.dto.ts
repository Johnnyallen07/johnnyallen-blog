import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUUID,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class SuggestYoutubeMetadataDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  taskIds: string[];
}
