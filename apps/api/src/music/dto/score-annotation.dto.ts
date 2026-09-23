import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class ScorePointDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  y: number;
}

class ScoreStrokeDto {
  @IsIn(['pen', 'line'])
  tool: 'pen' | 'line';

  @Matches(/^#[0-9a-fA-F]{6}$/)
  color: string;

  @IsNumber()
  @Min(0.001)
  @Max(0.1)
  width: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4000)
  @ValidateNested({ each: true })
  @Type(() => ScorePointDto)
  points: ScorePointDto[];
}

export class ScoreAnnotationDto {
  @IsString()
  @MaxLength(300)
  page: string;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ScoreStrokeDto)
  strokes: ScoreStrokeDto[];
}
