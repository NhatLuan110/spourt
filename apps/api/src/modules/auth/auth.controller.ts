import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@sprout/shared';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser, Public } from '@app/common/decorators/auth.decorators';
import { AppException } from '@app/common/exceptions/app.exception';
import { AuthService } from './auth.service';
import type { AuthResult } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';

const REFRESH_COOKIE = 'sprout_rt';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleOAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account with email and password' })
  async register(
    @Body(zodPipe(registerSchema)) body: RegisterInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.assertCookieOrigin(request);
    const result = await this.auth.register(body, this.contextOf(request));
    return this.respond(result, reply);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(zodPipe(loginSchema)) body: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.assertCookieOrigin(request);
    const result = await this.auth.login(body, this.contextOf(request));
    return this.respond(result, reply);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.assertCookieOrigin(request);
    const presented = this.readRefreshCookie(request);
    if (!presented) throw AppException.unauthenticated();
    const result = await this.auth.refresh(presented, this.contextOf(request));
    return this.respond(result, reply);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    this.assertCookieOrigin(request);
    await this.auth.logout(this.readRefreshCookie(request));
    void reply.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
    return { success: true };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out of every device' })
  async logoutAll(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const count = await this.auth.logoutEverywhere(userId);
    void reply.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
    return { revokedSessions: count };
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Start the Google OAuth flow' })
  async googleStart(@Res() reply: FastifyReply) {
    if (this.config.get<boolean>('COOKIE_CROSS_SITE')) {
      throw AppException.forbidden('Vui lòng đăng nhập bằng email và mật khẩu trên trang này.');
    }
    const { url, state, verifier } = this.google.buildAuthorizationUrl();
    void reply
      .setCookie('sprout_oauth', `${state}.${verifier}`, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.isSecure(),
        path: '/',
        maxAge: 600,
      })
      .redirect(url, HttpStatus.FOUND);
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const stored = (request.cookies as Record<string, string | undefined>)['sprout_oauth'];
    const [expectedState, verifier] = (stored ?? '').split('.');
    if (!code || !state || state !== expectedState || !verifier) {
      throw AppException.validation(null, 'Đăng nhập Google không thành công, vui lòng thử lại.');
    }

    const profile = await this.google.exchangeCode(code, verifier);
    const result = await this.auth.signInWithGoogle(profile, this.contextOf(request));

    this.setRefreshCookie(reply, result);
    const web = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    const target = result.user.onboarded ? '/dashboard' : '/welcome';
    void reply
      .clearCookie('sprout_oauth', { path: '/' })
      .redirect(`${web}/oauth/callback?next=${encodeURIComponent(target)}`, HttpStatus.FOUND);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(@Body(zodPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    const { token } = await this.auth.requestPasswordReset(body.email);
    // The response never reveals whether the address exists.
    return {
      sent: true,
      ...(this.config.get('NODE_ENV') === 'development' && token ? { devToken: token } : {}),
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body(zodPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.auth.resetPassword(body.token, body.password);
    return { success: true };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body(zodPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    await this.auth.verifyEmail(body.token);
    return { success: true };
  }

  private respond(result: AuthResult, reply: FastifyReply) {
    this.setRefreshCookie(reply, result);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  private setRefreshCookie(reply: FastifyReply, result: AuthResult): void {
    void reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.refreshCookieOptions(),
      expires: result.refreshExpiresAt,
    });
  }

  private refreshCookieOptions() {
    const crossSite = this.config.get<boolean>('COOKIE_CROSS_SITE') === true;
    return {
      httpOnly: true,
      secure: crossSite || this.isSecure(),
      sameSite: crossSite ? 'none' as const : 'lax' as const,
      partitioned: crossSite || undefined,
      path: '/',
      domain: this.config.get<string>('COOKIE_DOMAIN'),
    };
  }

  private assertCookieOrigin(request: FastifyRequest): void {
    if (this.config.get<boolean>('COOKIE_CROSS_SITE') !== true) return;
    const web = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    // SameSite=None permits cross-site cookies, so CORS alone is insufficient:
    // reject mutations before consuming or rotating a session, including forms.
    if (request.headers.origin !== new URL(web).origin) {
      throw AppException.forbidden('Yêu cầu đăng nhập không đến từ trang web được phép.');
    }
  }

  private readRefreshCookie(request: FastifyRequest): string | undefined {
    return (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  }

  private isSecure(): boolean {
    return this.config.get('NODE_ENV') === 'production';
  }

  private contextOf(request: FastifyRequest): { userAgent?: string; ip?: string } {
    return { userAgent: request.headers['user-agent'], ip: request.ip };
  }
}
