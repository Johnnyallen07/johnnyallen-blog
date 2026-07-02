import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUiTranslationDto {
  @IsString()
  text: string;

  @IsIn(['MACHINE', 'REVIEWED'])
  @IsOptional()
  status?: 'MACHINE' | 'REVIEWED';
}
