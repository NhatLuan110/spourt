import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  aiKeySchema,
  onboardingSchema,
  updateProfileSchema,
  updateSettingsSchema,
} from '@sprout/shared';
import type {
  AiKeyInput,
  OnboardingInput,
  UpdateProfileInput,
  UpdateSettingsInput,
} from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/auth.decorators';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Account, profile, settings and progress in one call' })
  me(@CurrentUser('id') userId: string) {
    return this.users.me(userId);
  }

  @Patch('me/profile')
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.users.updateProfile(userId, body);
  }

  @Patch('me/settings')
  updateSettings(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(updateSettingsSchema)) body: UpdateSettingsInput,
  ) {
    return this.users.updateSettings(userId, body);
  }

  @Post('me/onboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Store goals and daily commitment from the welcome flow' })
  completeOnboarding(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(onboardingSchema)) body: OnboardingInput,
  ) {
    return this.users.completeOnboarding(userId, body);
  }

  @Get('me/progress')
  progress(@CurrentUser('id') userId: string) {
    return this.users.progressSummary(userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete the account and revoke every session' })
  async remove(@CurrentUser('id') userId: string) {
    await this.users.deleteAccount(userId);
    return { deleted: true };
  }

  @Get('me/ai-key')
  @ApiOperation({ summary: 'Whether the learner has their own AI key, masked' })
  aiKeyStatus(@CurrentUser('id') userId: string) {
    return this.users.aiKeyStatus(userId);
  }

  @Put('me/ai-key')
  @ApiOperation({ summary: 'Save, replace or clear the learner’s own AI key' })
  setAiKey(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(aiKeySchema)) body: AiKeyInput,
  ) {
    return this.users.setAiKey(userId, body);
  }
}
