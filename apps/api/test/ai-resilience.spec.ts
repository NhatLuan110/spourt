import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tutorReplySchema } from '@sprout/shared';
import { AiService } from '@app/modules/ai/ai.service';
import { TUTOR_RESPONSE_SCHEMA } from '@app/modules/tutor/tutor.service';
import type { PrismaService } from '@app/infra/prisma/prisma.service';
import type { StudyDayService } from '@app/modules/gamification/study-day.service';
import type { SecretBoxService } from '@app/infra/crypto/secret-box.service';

const answer = { answerVi: 'Dùng "goes" với "she": She goes to school.', corrections: [] };
const context = { userId: 'test-learner', feature: 'tutor' as const };
const request = {
  tier: 'fast' as const,
  messages: [{ role: 'user' as const, content: 'Khi nào dùng goes?' }],
  maxOutputTokens: 3072,
  responseSchema: TUTOR_RESPONSE_SCHEMA,
};
const completion = (text = JSON.stringify(answer)) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 50 },
}), { status: 200 });

function harness(initialUsage = 0) {
  const logs: { feature: string; tokensIn: number; tokensOut: number }[] = [];
  const prisma = {
    userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    aiUsageLog: {
      count: vi.fn(async () => initialUsage + logs.filter((entry) => entry.feature === 'tutor').length),
      create: vi.fn(async ({ data }) => { logs.push(data); return data; }),
    },
  };
  const day = { today: vi.fn().mockResolvedValue({ start: new Date('2026-09-25'), end: new Date('2026-09-26') }) };
  const service = new AiService(prisma as unknown as PrismaService, day as unknown as StudyDayService, {} as SecretBoxService);
  return { service, logs, ask: () => service.completeJson(context, request, (raw) => tutorReplySchema.parse(raw)) };
}

describe('AI Tutor recovery and allowance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('AI_API_KEY', 'unit-test-key');
    vi.stubEnv('AI_DAILY_TUTOR_MESSAGES', '20');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('accepts two successive questions and supplies the tutor schema to Gemini', async () => {
    const fetcher = vi.fn().mockImplementation(async () => completion());
    vi.stubGlobal('fetch', fetcher);
    const { ask, service } = harness();
    await expect(ask()).resolves.toMatchObject({ value: answer });
    await expect(ask()).resolves.toMatchObject({ value: answer });
    expect(await service.remaining(context.userId, 'tutor')).toEqual({ used: 2, limit: 20 });
    const options = fetcher.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema).toEqual(TUTOR_RESPONSE_SCHEMA);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('recovers from an HTML 503 response and spends only one allowance', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('<html>Overloaded</html>', { status: 503 }))
      .mockResolvedValueOnce(completion());
    vi.stubGlobal('fetch', fetcher);
    const { ask, service } = harness();
    const pending = expect(ask()).resolves.toMatchObject({ value: answer });
    await vi.runAllTimersAsync();
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await service.remaining(context.userId, 'tutor')).used).toBe(1);
  });

  it('stops after two retries when Gemini remains overloaded without spending quota', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const { ask, logs } = harness();
    const pending = expect(ask()).rejects.toThrow('quá tải');
    await vi.runAllTimersAsync();
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(logs).toEqual([]);
  });

  it.each([429, 401, 400])('does not retry provider refusal HTTP %s', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status }));
    vi.stubGlobal('fetch', fetcher);
    const { ask, logs } = harness();
    await expect(ask()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([]);
  });

  it('repairs truncated JSON without consuming the learner’s final allowance twice', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(completion('{"answerVi":"unfinished')).mockResolvedValueOnce(completion());
    vi.stubGlobal('fetch', fetcher);
    const { ask, logs, service } = harness(19);
    await expect(ask()).resolves.toMatchObject({ value: answer });
    expect(logs.map((entry) => entry.feature)).toEqual(['tutor:invalid-response', 'tutor']);
    expect(logs[0]?.tokensOut).toBe(50);
    expect(await service.remaining(context.userId, 'tutor')).toEqual({ used: 20, limit: 20 });
    await expect(ask()).rejects.toThrow('20 lượt');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetcher.mock.calls[1]![1] as RequestInit).body as string);
    expect(secondBody.generationConfig.maxOutputTokens).toBeGreaterThan(3072);
  });

  it('does not spend quota when both responses violate the tutor schema', async () => {
    const fetcher = vi.fn().mockImplementation(async () => completion('{"unexpected":"field"}'));
    vi.stubGlobal('fetch', fetcher);
    const { ask, logs, service } = harness();
    await expect(ask()).rejects.toThrow('không bị trừ');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(logs).toHaveLength(2);
    expect((await service.remaining(context.userId, 'tutor')).used).toBe(0);
  });

  it('retries a transient network failure', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(completion());
    vi.stubGlobal('fetch', fetcher);
    const { ask } = harness();
    const pending = expect(ask()).resolves.toMatchObject({ value: answer });
    await vi.runAllTimersAsync();
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
