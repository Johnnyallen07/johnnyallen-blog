import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class SuggestYoutubeMetadataDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  taskIds: string[];
}
