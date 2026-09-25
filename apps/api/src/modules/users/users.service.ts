import { Injectable } from '@nestjs/common';
import {
  DAILY_GOAL_PRESETS,
  TREE_STAGES,
  isValidTimeZone,
  levelProgress,
  treeStageFromXp,
} from '@sprout/shared';
import type {
  AiKeyInput,
  AiKeyStatus,
  MeResponse,
  OnboardingInput,
  UpdateProfileInput,
  UpdateSettingsInput,
} from '@sprout/shared';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { SecretBoxService, maskKey } from '@app/infra/crypto/secret-box.service';
import { AppException } from '@app/common/exceptions/app.exception';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBoxService,
  ) {}

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, settings: true, progress: true },
    });

    if (!user || user.deletedAt || !user.profile || !user.settings || !user.progress) {
      throw AppException.notFound('Tài khoản');
    }

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified !== null,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      onboardedAt: user.onboardedAt?.toISOString() ?? null,
      profile: {
        displayName: user.profile.displayName,
        avatarUrl: user.profile.avatarUrl,
        bio: user.profile.bio,
        nativeLang: user.profile.nativeLang,
        timezone: user.profile.timezone,
        currentLevel: user.profile.currentLevel,
      },
      settings: {
        dailyGoalMinutes: user.settings.dailyGoalMinutes,
        dailyGoalXp: user.settings.dailyGoalXp,
        newWordsPerDay: user.settings.newWordsPerDay,
        maxReviewsPerDay: user.settings.maxReviewsPerDay,
        dayRolloverHour: user.settings.dayRolloverHour,
        theme: user.settings.theme,
        reminderEnabled: user.settings.reminderEnabled,
        reminderTime: user.settings.reminderTime,
        ttsVoice: user.settings.ttsVoice,
        ttsAccent: user.settings.ttsAccent,
        autoPlayAudio: user.settings.autoPlayAudio,
        showIpa: user.settings.showIpa,
        quietMode: user.settings.quietMode,
        leaderboardVisibility: user.settings.leaderboardVisibility,
        learningGoals: user.settings.learningGoals,
        // The key itself never leaves the server; only enough to recognise it.
        aiKeyHint: user.settings.aiApiKeyHint,
        aiProvider: user.settings.aiProvider,
      },
      progress: {
        totalXp: user.progress.totalXp,
        level: user.progress.level,
        coins: user.progress.coins,
        currentStreak: user.progress.currentStreak,
        longestStreak: user.progress.longestStreak,
        lastStudyDate: user.progress.lastStudyDate?.toISOString() ?? null,
        streakFreezes: user.progress.streakFreezes,
        treeStage: user.progress.treeStage,
        totalStudyMin: user.progress.totalStudyMin,
        wordsLearned: user.progress.wordsLearned,
      },
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<MeResponse> {
    if (input.timezone && !isValidTimeZone(input.timezone)) {
      throw AppException.validation({ path: 'timezone' }, 'Múi giờ không hợp lệ.');
    }

    await this.prisma.profile.update({
      where: { userId },
      data: {
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        bio: input.bio,
        timezone: input.timezone,
        currentLevel: input.currentLevel,
      },
    });
    return this.me(userId);
  }

  async updateSettings(userId: string, input: UpdateSettingsInput): Promise<MeResponse> {
    await this.prisma.userSettings.update({ where: { userId }, data: input });
    return this.me(userId);
  }

  /** §7.1 — goals and daily commitment, applied as one step. */
  async completeOnboarding(userId: string, input: OnboardingInput): Promise<MeResponse> {
    const preset =
      DAILY_GOAL_PRESETS.find((entry) => entry.minutes === input.dailyGoalMinutes) ??
      DAILY_GOAL_PRESETS[2];

    await this.prisma.$transaction([
      this.prisma.userSettings.update({
        where: { userId },
        data: {
          learningGoals: input.goals,
          dailyGoalMinutes: preset.minutes,
          dailyGoalXp: preset.xp,
          newWordsPerDay: preset.newWordsPerDay,
          maxReviewsPerDay: preset.maxReviewsPerDay,
        },
      }),
      this.prisma.profile.update({
        where: { userId },
        data: input.selfAssessedLevel ? { currentLevel: input.selfAssessedLevel } : {},
      }),
      this.prisma.user.update({
        where: { id: userId },
        // Taking the placement test finishes onboarding when the test is submitted.
        data: { onboardedAt: input.takePlacementTest ? null : new Date() },
      }),
    ]);

    return this.me(userId);
  }

  async markOnboarded(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
  }

  /** §7.13 — soft delete now, hard delete of media within 30 days. */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), email: `deleted-${userId}@sprout.invalid`, passwordHash: null },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** Progress summary shared by the dashboard hero and the profile page. */
  async progressSummary(userId: string) {
    const progress = await this.prisma.userProgress.findUnique({ where: { userId } });
    if (!progress) throw AppException.notFound('Tiến độ');

    const level = levelProgress(progress.totalXp);
    const tree = treeStageFromXp(progress.totalXp);

    return {
      totalXp: progress.totalXp,
      coins: progress.coins,
      currentStreak: progress.currentStreak,
      longestStreak: progress.longestStreak,
      streakFreezes: progress.streakFreezes,
      level,
      tree: {
        stage: tree.stage,
        key: tree.key,
        nameVi: tree.nameVi,
        emoji: tree.emoji,
        nextStageXp: TREE_STAGES.find((stage) => stage.minXp > progress.totalXp)?.minXp ?? null,
      },
    };
  }

  /**
   * Saves, replaces or clears the learner's own AI key (D-052).
   *
   * An empty string clears it, because "remove my key" and "set my key" are
   * the same request from the settings form. The key is encrypted before it
   * touches the database and only the masked hint is ever readable again.
   */
  async setAiKey(userId: string, input: AiKeyInput): Promise<AiKeyStatus> {
    const apiKey = input.apiKey.trim();

    if (apiKey.length === 0) {
      await this.prisma.userSettings.update({
        where: { userId },
        data: { aiApiKeyEncrypted: null, aiApiKeyHint: null, aiProvider: null },
      });
      return { hint: null, provider: null, readable: true };
    }

    if (apiKey.length < 16) {
      throw AppException.validation(
        { apiKey: "too_short" },
        'Khoá này trông quá ngắn. Kiểm tra lại xem đã sao chép đủ chưa.',
      );
    }

    const hint = maskKey(apiKey);
    await this.prisma.userSettings.update({
      where: { userId },
      data: {
        aiApiKeyEncrypted: this.secrets.encrypt(apiKey),
        aiApiKeyHint: hint,
        aiProvider: input.provider,
      },
    });
    return { hint, provider: input.provider, readable: true };
  }

  async aiKeyStatus(userId: string): Promise<AiKeyStatus> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { aiApiKeyEncrypted: true, aiApiKeyHint: true, aiProvider: true },
    });
    if (!settings?.aiApiKeyEncrypted) {
      return { hint: null, provider: null, readable: true };
    }
    return {
      hint: settings.aiApiKeyHint,
      provider: settings.aiProvider,
      // A false here means the encryption key changed; the learner is asked
      // to re-enter rather than being shown a silent failure later.
      readable: this.secrets.decrypt(settings.aiApiKeyEncrypted) !== null,
    };
  }

  /**
   * The decrypted key, for AiService to authenticate with. Returns null when
   * the learner has not set one, so the caller falls back to the server key.
   */
  async aiKeyFor(userId: string): Promise<{ key: string; provider: string } | null> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { aiApiKeyEncrypted: true, aiProvider: true },
    });
    if (!settings?.aiApiKeyEncrypted) return null;
    const key = this.secrets.decrypt(settings.aiApiKeyEncrypted);
    if (key === null) return null;
    return { key, provider: settings.aiProvider ?? 'gemini' };
  }
}
