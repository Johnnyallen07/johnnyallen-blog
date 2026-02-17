import { PartialType } from '@nestjs/mapped-types';
import { CreatePostDto } from './create-post.dto';
import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdatePostDto extends PartialType(CreatePostDto) {
  /**
   * seriesId: 绑定文章到指定 Series
   * - string: 绑定到该 Series（自动解除旧绑定）
   * - null: 从所有 Series 解除绑定（变为独立文章）
   * - undefined: 不改变 Series 绑定关系
   */
  @IsOptional()
  @ValidateIf((_object: UpdatePostDto, value: unknown) => value !== null)
  @IsString()
  seriesId?: string | null;
}
