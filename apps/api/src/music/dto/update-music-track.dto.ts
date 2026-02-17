import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateMusicTrackDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    musician?: string;

    @IsOptional()
    @IsString()
    performer?: string;

    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsString()
    series?: string;

    @IsOptional()
    @IsNumber()
    duration?: number;

    @IsOptional()
    @IsString()
    coverUrl?: string;
}
