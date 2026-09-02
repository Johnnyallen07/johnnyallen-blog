import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CompleteSyncDto,
  CreateMomentCategoryDto,
  CreateSyncTokenDto,
  CreateUploadUrlDto,
  MomentCatalogQueryDto,
  MomentLoginDto,
  TotpCodeDto,
  UpdateMomentAssetDto,
  UpdateMomentCategoryDto,
} from './dto/moment.dto';
import { MomentAuthService } from './moment-auth.service';
import {
  MomentAccessGuard,
  MomentAdminGuard,
  MomentLoginGatewayGuard,
  MomentSyncGuard,
} from './moment.guards';
import type { MomentRequest } from './moment.guards';
import { MomentService } from './moment.service';
import { MomentStorageService } from './moment-storage.service';

@Controller('moment')
export class MomentController {
  constructor(
    private readonly auth: MomentAuthService,
    private readonly moment: MomentService,
    private readonly storage: MomentStorageService,
  ) {}

  @Post('auth/login')
  @UseGuards(MomentLoginGatewayGuard)
  login(@Body() dto: MomentLoginDto, @Req() req: Request) {
    return this.auth.login(dto.username, dto.password, dto.code, req.ip);
  }

  @Get('auth/setup/status')
  @UseGuards(JwtAuthGuard)
  setupStatus(@Req() req: Request & { user: { id: string } }) {
    return this.auth.status(req.user.id);
  }

  @Post('auth/setup/start')
  @UseGuards(JwtAuthGuard)
  startSetup(@Req() req: Request & { user: { id: string; username: string } }) {
    return this.auth.startSetup(req.user);
  }

  @Post('auth/setup/confirm')
  @UseGuards(JwtAuthGuard)
  confirmSetup(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: TotpCodeDto,
  ) {
    return this.auth.confirmSetup(req.user.id, dto.code);
  }

  @Get('catalog')
  @UseGuards(MomentAccessGuard)
  catalog(@Query() query: MomentCatalogQueryDto, @Req() req: MomentRequest) {
    return this.moment.catalog(query, req.momentAccess!);
  }

  @Get('assets/:id/content')
  @UseGuards(MomentAccessGuard)
  async content(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Req() req: MomentRequest,
    @Res() res: Response,
  ) {
    const asset = await this.moment.assetForContent(id, req.momentAccess!);
    const object = await this.storage.getObject(asset.objectKey);
    const fileName = encodeURIComponent(asset.originalName);
    const shouldDownload = download === '1';
    res.set('Content-Type', asset.mimeType || object.contentType);
    if (object.contentLength) res.set('Content-Length', object.contentLength);
    res.set(
      'Content-Disposition',
      `${shouldDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${fileName}`,
    );
    res.set('X-Content-Type-Options', 'nosniff');
    res.set(
      'Cache-Control',
      req.momentAccess === 'admin'
        ? 'private, no-store'
        : 'private, max-age=300',
    );
    await this.moment.auditContent(
      req.momentActor!,
      asset.id,
      shouldDownload ? 'DOWNLOAD' : 'VIEW',
    );
    object.stream.pipe(res);
  }

  @Get('admin/categories')
  @UseGuards(MomentAdminGuard)
  categories() {
    return this.moment.categories();
  }

  @Post('admin/categories')
  @UseGuards(MomentAdminGuard)
  createCategory(@Body() dto: CreateMomentCategoryDto) {
    return this.moment.createCategory(dto);
  }

  @Patch('admin/categories/:id')
  @UseGuards(MomentAdminGuard)
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateMomentCategoryDto,
  ) {
    return this.moment.updateCategory(id, dto);
  }

  @Delete('admin/categories/:id')
  @UseGuards(MomentAdminGuard)
  deleteCategory(@Param('id') id: string) {
    return this.moment.deleteCategory(id);
  }

  @Patch('admin/assets/:id')
  @UseGuards(MomentAdminGuard)
  updateAsset(
    @Param('id') id: string,
    @Body() dto: UpdateMomentAssetDto,
    @Req() req: MomentRequest,
  ) {
    return this.moment.updateAsset(id, dto, req.momentActor!);
  }

  @Get('admin/sync-tokens')
  @UseGuards(MomentAdminGuard)
  syncTokens() {
    return this.moment.syncTokens();
  }

  @Post('admin/sync-tokens')
  @UseGuards(MomentAdminGuard)
  createSyncToken(@Body() dto: CreateSyncTokenDto, @Req() req: MomentRequest) {
    return this.moment.createSyncToken(dto, req.momentActor!);
  }

  @Delete('admin/sync-tokens/:id')
  @UseGuards(MomentAdminGuard)
  revokeSyncToken(@Param('id') id: string, @Req() req: MomentRequest) {
    return this.moment.revokeSyncToken(id, req.momentActor!);
  }

  @Get('sync/manifest')
  @UseGuards(MomentSyncGuard)
  manifest() {
    return this.moment.manifest();
  }

  @Post('sync/upload-url')
  @UseGuards(MomentSyncGuard)
  uploadUrl(@Body() dto: CreateUploadUrlDto) {
    return this.moment.createUploadUrl(dto);
  }

  @Post('sync/complete')
  @UseGuards(MomentSyncGuard)
  completeSync(@Body() dto: CompleteSyncDto, @Req() req: MomentRequest) {
    return this.moment.completeSync(dto, req.momentActor!);
  }
}
