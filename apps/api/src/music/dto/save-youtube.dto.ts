import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class SaveYoutubeDto {
  @IsString()
  @Matches(/\S/, { message: '请填写标题' })
  @MaxLength(500)
  title: string;

  @IsString()
  @Matches(/\S/, { message: '请填写作曲家' })
  @MaxLength(200)
  musician: string;

  @IsString()
  @Matches(/\S/, { message: '请填写演奏者' })
  @MaxLength(200)
  performer: string;

  @IsString()
  @Matches(/\S/, { message: '请选择分类' })
  @MaxLength(200)
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  series?: string;
}
