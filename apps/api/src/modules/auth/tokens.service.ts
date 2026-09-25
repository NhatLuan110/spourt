import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { ERROR_CODES } from '@sprout/shared';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';
import type { AccessTokenPayload } from '@app/common/guards/jwt-auth.guard';

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface TokenSubject {
  id: string;
  email: string;
  role: AccessTokenPayload['role'];
  timezone: string;
  dayRolloverHour: number;
}

const REFRESH_BYTES = 48;

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessTtlSeconds(): number {
    const ttl = this.config.get<string>('ACCESS_TOKEN_TTL') ?? '15m';
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit as string] ?? 60);
  }

  async signAccessToken(subject: TokenSubject): Promise<{ token: string; expiresIn: number }> {
    const expiresIn = this.accessTtlSeconds();
    const payload: AccessTokenPayload = {
      sub: subject.id,
      email: subject.email,
      role: subject.role,
      tz: subject.timezone,
      rh: subject.dayRolloverHour,
    };
    const token = await this.jwt.signAsync(payload, {
      algorithm: 'RS256',
      privateKey: this.config.get<string>('JWT_PRIVATE_KEY'),
      expiresIn,
    });
    return { token, expiresIn };
  }

  /**
   * §11 — refresh tokens rotate. Each new token belongs to the same "family";
   * seeing a token that was already used means it leaked, so the whole family
   * is revoked and the learner has to sign in again.
   */
  async issueRefreshToken(params: {
    userId: string;
    family?: string;
    userAgent?: string;
    ip?: string;
    replacesSessionId?: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const raw = randomBytes(REFRESH_BYTES).toString('base64url');
    const days = this.config.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 30;
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    const family = params.family ?? randomBytes(16).toString('hex');

    const session = await this.prisma.session.create({
      data: {
        userId: params.userId,
        tokenHash: this.hashToken(raw),
        family,
        userAgent: params.userAgent?.slice(0, 300),
        ip: params.ip,
        expiresAt,
      },
    });

    if (params.replacesSessionId) {
      await this.prisma.session.update({
        where: { id: params.replacesSessionId },
        data: { revokedAt: new Date(), replacedBy: session.id },
      });
    }

    return { token: `${family}.${raw}`, expiresAt };
  }

  async rotateRefreshToken(
    presented: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{ userId: string; token: string; expiresAt: Date }> {
    const [family, raw] = presented.split('.');
    if (!family || !raw) throw new AppException(ERROR_CODES.REFRESH_TOKEN_INVALID, HttpStatus.UNAUTHORIZED);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(raw) },
    });

    if (!session || session.family !== family) {
      throw new AppException(ERROR_CODES.REFRESH_TOKEN_INVALID, HttpStatus.UNAUTHORIZED);
    }

    if (session.revokedAt) {
      // Reuse of a rotated token: assume theft and drop every session in the family.
      await this.prisma.session.updateMany({
        where: { family: session.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppException(ERROR_CODES.REFRESH_TOKEN_REUSED, HttpStatus.UNAUTHORIZED);
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppException(ERROR_CODES.REFRESH_TOKEN_INVALID, HttpStatus.UNAUTHORIZED);
    }

    const next = await this.issueRefreshToken({
      userId: session.userId,
      family: session.family,
      userAgent: context.userAgent,
      ip: context.ip,
      replacesSessionId: session.id,
    });

    return { userId: session.userId, token: next.token, expiresAt: next.expiresAt };
  }

  async revokeToken(presented: string): Promise<void> {
    const [, raw] = presented.split('.');
    if (!raw) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: this.hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
