import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSeriesStructureItemDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsUUID()
  @IsOptional()
  parentId?: string | null;

  @IsNumber()
  order: number;
}

export class UpdateSeriesStructureDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSeriesStructureItemDto)
  items: UpdateSeriesStructureItemDto[];
}
