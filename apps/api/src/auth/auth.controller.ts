import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Delete,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberDevice = true;

  @IsOptional()
  @IsInt()
  @IsIn([1, 7, 30])
  trustedDays = 7;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(
      dto.username,
      dto.password,
      dto.rememberDevice,
      dto.trustedDays,
      req.get('user-agent'),
      req.ip,
    );
  }

  @Post('trusted/refresh')
  refresh(
    @Headers('x-admin-trusted-token') token: string | undefined,
    @Req() req: Request,
  ) {
    if (!token) throw new UnauthorizedException('缺少可信设备凭证');
    return this.authService.refreshTrustedDevice(
      token,
      req.get('user-agent'),
      req.ip,
    );
  }

  @Post('trusted/revoke')
  revoke(@Headers('x-admin-trusted-token') token: string | undefined) {
    if (!token) return { revoked: false };
    return this.authService.revokeTrustedToken(token);
  }

  @Get('trusted-devices')
  @UseGuards(JwtAuthGuard)
  trustedDevices(@Req() req: Request & { user: { id: string } }) {
    return this.authService.trustedDevices(req.user.id);
  }

  @Delete('trusted-devices/:id')
  @UseGuards(JwtAuthGuard)
  revokeDevice(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.authService.revokeTrustedDevice(req.user.id, id);
  }

  @Get('me')
  async me(@Headers('authorization') authHeader: string) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少认证 Token');
    }
    const token = authHeader.slice(7);
    return this.authService.getProfile(token);
  }
}
