import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { I18nService } from './i18n.service';
import { TranslationService } from './translation/translation.service';
import { CONTENT_REGISTRY } from './content-registry';
import { SyncMessagesDto } from './dto/sync-messages.dto';
import { UpdateUiTranslationDto } from './dto/update-ui-translation.dto';
import { UpdateContentTranslationDto } from './dto/update-content-translation.dto';
import { TranslateRequestDto } from './dto/translate-request.dto';

type StatusFilter =
  | 'untranslated'
  | 'machine'
  | 'reviewed'
  | 'stale'
  | 'orphaned';

@Controller('i18n')
export class I18nController {
  constructor(
    private readonly i18nService: I18nService,
    private readonly translationService: TranslationService,
  ) {}

  /** 公开：next-intl 消息树（前端运行时拉取） */
  @Get('messages')
  getMessages(@Query('app') app = 'web', @Query('locale') locale = 'zh') {
    return this.i18nService.getMessages(app, locale);
  }

  /** 内容实体类型元数据（admin 用于渲染子 Tab） */
  @Get('content-types')
  @UseGuards(JwtAuthGuard)
  getContentTypes() {
    return Object.entries(CONTENT_REGISTRY).map(([entityType, config]) => ({
      entityType,
      displayName: config.displayName,
      fields: config.fields,
      markdownFields: config.markdownFields ?? [],
      label: config.label,
    }));
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  sync(@Body() dto: SyncMessagesDto) {
    return this.i18nService.syncMessages(dto.app, dto.messages);
  }

  @Get('ui-messages')
  @UseGuards(JwtAuthGuard)
  listUiMessages(
    @Query('app') app?: string,
    @Query('locale') locale?: string,
    @Query('status') status?: StatusFilter,
    @Query('search') search?: string,
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) {
    return this.i18nService.listUiMessages({
      app,
      locale,
      status,
      search,
      skip,
      take,
    });
  }

  @Put('ui-messages/:id/translations/:locale')
  @UseGuards(JwtAuthGuard)
  updateUiTranslation(
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body() dto: UpdateUiTranslationDto,
  ) {
    return this.i18nService.updateUiTranslation(
      id,
      locale,
      dto.text,
      dto.status ?? 'REVIEWED',
    );
  }

  @Get('content')
  @UseGuards(JwtAuthGuard)
  listContent(
    @Query('entityType') entityType: string,
    @Query('locale') locale?: string,
    @Query('status') status?: StatusFilter,
    @Query('search') search?: string,
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) {
    return this.i18nService.listContent({
      entityType,
      locale,
      status,
      search,
      skip,
      take,
    });
  }

  @Get('content/:entityType/:entityId')
  @UseGuards(JwtAuthGuard)
  getContentDetail(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('locale') locale?: string,
  ) {
    return this.i18nService.getContentDetail(entityType, entityId, locale);
  }

  @Put('content/:entityType/:entityId')
  @UseGuards(JwtAuthGuard)
  updateContentTranslations(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Body() dto: UpdateContentTranslationDto,
  ) {
    return this.i18nService.updateContentTranslations(
      entityType,
      entityId,
      dto.locale,
      dto.fields,
      dto.status ?? 'REVIEWED',
    );
  }

  /** 自动翻译：≤25 条 UI 文案或 1 个内容实体；返回逐项结果 */
  @Post('translate')
  @UseGuards(JwtAuthGuard)
  async translate(@Body() dto: TranslateRequestDto) {
    const response: {
      ui?: Array<{ id: string; ok: boolean; error?: string }>;
      content?: Array<{
        entityType: string;
        entityId: string;
        fields: Array<{ field: string; ok: boolean; error?: string }>;
      }>;
    } = {};

    if (dto.uiMessageIds?.length) {
      const { results, affectedApps } =
        await this.translationService.translateUiMessages(
          dto.uiMessageIds,
          dto.targetLocale,
        );
      response.ui = results;
      if (affectedApps.length > 0) {
        await this.i18nService.invalidateMessagesCache();
      }
    }

    if (dto.content?.length) {
      response.content = [];
      for (const item of dto.content) {
        const fields = await this.translationService.translateContent(
          item.entityType,
          item.entityId,
          dto.targetLocale,
          item.fields,
        );
        response.content.push({
          entityType: item.entityType,
          entityId: item.entityId,
          fields,
        });
      }
    }

    return response;
  }
}
