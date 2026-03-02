import { IsString, IsUrl } from 'class-validator';

export class YoutubeDownloadDto {
  @IsString()
  @IsUrl()
  url: string;
}
