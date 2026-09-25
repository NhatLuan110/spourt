import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../exceptions/app.exception';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import type { AuthenticatedUser, RequestWithUser } from '../decorators/auth.decorators';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: AuthenticatedUser['role'];
  tz: string;
  rh: number;
}

/** Applied globally in AppModule; routes opt out with @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw AppException.unauthenticated();
    }

    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        publicKey: this.config.get<string>('JWT_PUBLIC_KEY'),
        algorithms: ['RS256'],
      });
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        timezone: payload.tz,
        dayRolloverHour: payload.rh,
      };
      return true;
    } catch {
      throw AppException.unauthenticated('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    }
  }
}
