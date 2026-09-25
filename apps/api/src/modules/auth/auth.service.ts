import { HttpStatus, Injectable } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { ERROR_CODES, isValidTimeZone } from '@sprout/shared';
import type { LoginInput, RegisterInput } from '@sprout/shared';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';
import { TokensService } from './tokens.service';
import type { TokenSubject } from './tokens.service';

// OWASP recommended argon2id parameters.
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    onboarded: boolean;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  async register(input: RegisterInput, context: { userAgent?: string; ip?: string }): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw AppException.conflict(ERROR_CODES.EMAIL_ALREADY_REGISTERED);
    }

    const timezone = isValidTimeZone(input.timezone) ? input.timezone : 'Asia/Ho_Chi_Minh';
    const passwordHash = await argonHash(input.password, ARGON_OPTIONS);

    // Profile, settings and progress are created together: every later query
    // assumes all three rows exist for a user.
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        profile: { create: { displayName: input.displayName, timezone } },
        settings: { create: {} },
        progress: { create: {} },
      },
      include: { profile: true, settings: true },
    });

    return this.completeSignIn(user.id, context);
  }

  async login(input: LoginInput, context: { userAgent?: string; ip?: string }): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { profile: true, settings: true },
    });

    // Same error for unknown email and wrong password, so the endpoint cannot
    // be used to enumerate registered addresses.
    if (!user || !user.passwordHash || user.deletedAt) {
      throw new AppException(ERROR_CODES.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }

    const valid = await argonVerify(user.passwordHash, input.password).catch(() => false);
    if (!valid) {
      throw new AppException(ERROR_CODES.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }

    return this.completeSignIn(user.id, context);
  }

  /** Google OAuth: link by provider id, or by verified email, else create. */
  async signInWithGoogle(
    profile: { providerAccountId: string; email: string; displayName: string; avatarUrl?: string },
    context: { userAgent?: string; ip?: string },
  ): Promise<AuthResult> {
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.providerAccountId,
        },
      },
    });

    if (linked) return this.completeSignIn(linked.userId, context);

    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      await this.prisma.oAuthAccount.create({
        data: {
          userId: byEmail.id,
          provider: 'google',
          providerAccountId: profile.providerAccountId,
        },
      });
      return this.completeSignIn(byEmail.id, context);
    }

    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        emailVerified: new Date(),
        profile: {
          create: {
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        },
        settings: { create: {} },
        progress: { create: {} },
        oauthAccounts: {
          create: { provider: 'google', providerAccountId: profile.providerAccountId },
        },
      },
    });

    return this.completeSignIn(created.id, context);
  }

  async refresh(presented: string, context: { userAgent?: string; ip?: string }): Promise<AuthResult> {
    const rotated = await this.tokens.rotateRefreshToken(presented, context);
    const subject = await this.loadSubject(rotated.userId);
    const access = await this.tokens.signAccessToken(subject);
    const user = await this.loadPublicUser(rotated.userId);

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
      user,
    };
  }

  async logout(presented?: string): Promise<void> {
    if (presented) await this.tokens.revokeToken(presented);
  }

  async logoutEverywhere(userId: string): Promise<number> {
    return this.tokens.revokeAllForUser(userId);
  }

  /**
   * Always resolves, whether or not the email exists — the caller must not be
   * able to tell. The token itself is only stored hashed.
   */
  async requestPasswordReset(email: string): Promise<{ token: string | null }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return { token: null };

    const raw = randomBytes(32).toString('base64url');
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        kind: 'password-reset',
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    return { token: raw };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.consumeToken(token, 'password-reset');
    const passwordHash = await argonHash(password, ARGON_OPTIONS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      // Changing a password invalidates every existing session.
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async createEmailVerificationToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.verificationToken.create({
      data: {
        userId,
        kind: 'email-verify',
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return raw;
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.consumeToken(token, 'email-verify');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    });
  }

  private async consumeToken(token: string, kind: string): Promise<{ userId: string }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });

    if (!record || record.kind !== kind || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw AppException.validation(null, 'Liên kết không hợp lệ hoặc đã hết hạn.');
    }

    await this.prisma.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return { userId: record.userId };
  }

  private async completeSignIn(
    userId: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<AuthResult> {
    const subject = await this.loadSubject(userId);
    const access = await this.tokens.signAccessToken(subject);
    const refresh = await this.tokens.issueRefreshToken({ userId, ...context });
    const user = await this.loadPublicUser(userId);

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user,
    };
  }

  private async loadSubject(userId: string): Promise<TokenSubject> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, settings: true },
    });
    if (!user || user.deletedAt) throw AppException.unauthenticated();

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      timezone: user.profile?.timezone ?? 'Asia/Ho_Chi_Minh',
      dayRolloverHour: user.settings?.dayRolloverHour ?? 4,
    };
  }

  private async loadPublicUser(userId: string): Promise<AuthResult['user']> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    return {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? 'Bạn',
      role: user.role,
      onboarded: user.onboardedAt !== null,
    };
  }
}
