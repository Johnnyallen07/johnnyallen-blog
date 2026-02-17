import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 开发环境下将未捕获异常的真实原因返回给前端，便于排查「数据库字段与 Prisma schema 不一致」等问题。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isProd = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      message = typeof payload === 'string' ? payload : (payload as { message?: string }).message ?? message;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`${req.method} ${req.url} ${exception.message}`, exception.stack);
    }

    const body: Record<string, unknown> = { message };
    if (!isProd && exception instanceof Error && exception.stack) {
      body.stack = exception.stack;
    }

    res.status(status).json(body);
  }
}
