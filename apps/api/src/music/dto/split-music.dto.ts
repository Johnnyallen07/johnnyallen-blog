import { IsString, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SplitSegmentDto {
  @IsString()
  title: string;

  @IsNumber()
  startTime: number;

  @IsNumber()
  endTime: number;
}

export class SplitMusicDto {
  @IsString()
  trackId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitSegmentDto)
  segments: SplitSegmentDto[];
}
