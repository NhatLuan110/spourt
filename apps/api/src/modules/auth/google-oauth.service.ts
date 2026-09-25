import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '@app/common/exceptions/app.exception';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleProfile {
  providerAccountId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

/** §4.2 — Google OAuth 2.0 with PKCE, no third party SDK. */
@Injectable()
export class GoogleOAuthService {
  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(
      this.config.get('GOOGLE_CLIENT_ID') &&
        this.config.get('GOOGLE_CLIENT_SECRET') &&
        this.config.get('GOOGLE_CALLBACK_URL'),
    );
  }

  buildAuthorizationUrl(): { url: string; state: string; verifier: string } {
    this.assertConfigured();
    const state = randomBytes(16).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'online',
      prompt: 'select_account',
    });

    return { url: `${AUTH_ENDPOINT}?${params.toString()}`, state, verifier };
  }

  async exchangeCode(code: string, verifier: string): Promise<GoogleProfile> {
    this.assertConfigured();

    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
        client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
        redirect_uri: this.config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });

    if (!tokenResponse.ok) {
      throw AppException.validation(null, 'Không lấy được thông tin từ Google.');
    }

    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) {
      throw AppException.validation(null, 'Không lấy được thông tin từ Google.');
    }

    const userResponse = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userResponse.ok) {
      throw AppException.validation(null, 'Không đọc được hồ sơ Google.');
    }

    const profile = (await userResponse.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (!profile.email || profile.email_verified === false) {
      throw AppException.validation(null, 'Tài khoản Google chưa xác thực email.');
    }

    return {
      providerAccountId: profile.sub,
      email: profile.email.toLowerCase(),
      displayName: profile.name ?? profile.email.split('@')[0] ?? 'Bạn',
      avatarUrl: profile.picture,
    };
  }

  private assertConfigured(): void {
    if (!this.isConfigured) {
      throw AppException.validation(
        null,
        'Đăng nhập Google chưa được cấu hình trên máy chủ này. Hãy dùng email và mật khẩu.',
      );
    }
  }
}
