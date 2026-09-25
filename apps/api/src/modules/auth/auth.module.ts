import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { GoogleOAuthService } from './google-oauth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokensService, GoogleOAuthService],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
