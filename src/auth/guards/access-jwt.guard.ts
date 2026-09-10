import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app.exception.js';
import { ERROR_CODE } from '../../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../../common/errors/error-messages.js';
import type {
  AccessTokenPayload,
  AuthenticatedRequest,
} from '../auth.types.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class AccessJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw this.accessRequiredException();
    }

    const secret = this.configService.getOrThrow<string>('JWT_SECRET');

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret, algorithms: ['HS256'] },
      );

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw this.accessRequiredException();
      }

      request.user = { userId: payload.sub };
      return true;
    } catch {
      throw this.accessRequiredException();
    }
  }

  private extractBearerToken(authorization?: string): string | undefined {
    const [type, token, extra] = authorization?.split(' ') ?? [];

    return type === 'Bearer' && token && !extra ? token : undefined;
  }

  private accessRequiredException(): AppException {
    return new AppException({
      statusCode: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODE.AUTH_ACCESS_REQUIRED,
      message: ERROR_MESSAGE.AUTH_ACCESS_REQUIRED,
    });
  }
}
