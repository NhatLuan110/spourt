import { describe, expect, it } from 'vitest';
import { validateEnv } from '@app/infra/config/env';
import {
  aiApiKey,
  isProviderConfigured,
  speechApiKey,
  speechProviderName,
} from '@app/infra/config/env';
import { createProvider, createSpeechProvider, stripCodeFence } from '@app/modules/ai/ai.service';
import { pcmToWav } from '@app/modules/ai/gemini.provider';

/**
 * The provider layer is unit-tested without touching the network. The live
 * check against the real provider lives in scripts/demo-p3.ts, which is run by
 * hand because it spends quota.
 */

const BASE = {
  DATABASE_URL: 'postgresql://x/y',
};

function env(overrides: Record<string, string>) {
  return validateEnv({ ...BASE, ...overrides });
}

describe('provider selection', () => {
  it('defaults to Gemini', () => {
    expect(createProvider(env({})).name).toBe('gemini');
  });

  it('honours AI_PROVIDER for every supported provider', () => {
    for (const name of ['gemini', 'groq', 'openrouter', 'ollama', 'anthropic']) {
      expect(createProvider(env({ AI_PROVIDER: name })).name).toBe(name);
    }
  });

  it('rejects a provider that does not exist rather than falling back silently', () => {
    expect(() => env({ AI_PROVIDER: 'chatgpt' })).toThrow();
  });
});

describe('key resolution', () => {
  it('reads AI_API_KEY', () => {
    expect(aiApiKey(env({ AI_API_KEY: 'k1' }))).toBe('k1');
  });

  it('still accepts the older ANTHROPIC_API_KEY so an upgrade does not break', () => {
    expect(aiApiKey(env({ ANTHROPIC_API_KEY: 'k2' }))).toBe('k2');
  });

  it('prefers AI_API_KEY when both are set', () => {
    expect(aiApiKey(env({ AI_API_KEY: 'new', ANTHROPIC_API_KEY: 'old' }))).toBe('new');
  });

  it('reports not configured with no key at all', () => {
    expect(isProviderConfigured(env({}), 'ai')).toBe(false);
    expect(createProvider(env({})).isConfigured()).toBe(false);
  });

  it('treats Ollama as configured without a key, because it runs locally', () => {
    const local = env({ AI_PROVIDER: 'ollama' });
    expect(isProviderConfigured(local, 'ai')).toBe(true);
    expect(createProvider(local).isConfigured()).toBe(true);
  });
});

describe('capability reporting', () => {
  it('says Gemini can speak and listen once a key is present', () => {
    const configured = env({ AI_API_KEY: 'k' });
    expect(isProviderConfigured(configured, 'tts')).toBe(true);
    expect(isProviderConfigured(configured, 'stt')).toBe(true);

    const provider = createProvider(configured);
    expect(typeof provider.speak).toBe('function');
    expect(typeof provider.transcribe).toBe('function');
  });

  it('says a text-only provider cannot speak, rather than failing later', () => {
    const groq = createProvider(env({ AI_PROVIDER: 'groq', AI_API_KEY: 'k' }));
    expect(groq.speak).toBeUndefined();
    expect(groq.transcribe).toBeUndefined();
  });

  it('does not claim speech from Gemini when the key is missing', () => {
    expect(isProviderConfigured(env({ AI_PROVIDER: 'gemini' }), 'tts')).toBe(false);
  });

  it('does not claim speech from a provider that is only named, never built', () => {
    // Azure and ElevenLabs are nameable in configuration but nothing reads
    // them yet. Reporting them as configured would light up the record button
    // and fail on the first press.
    expect(
      isProviderConfigured(
        env({ AZURE_SPEECH_KEY: 'a', AZURE_SPEECH_REGION: 'southeastasia' }),
        'tts',
      ),
    ).toBe(false);
    expect(isProviderConfigured(env({ ELEVENLABS_API_KEY: 'e' }), 'tts')).toBe(false);
  });
});

describe('stripCodeFence', () => {
  it('leaves bare JSON alone', () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });

  it('removes a json fence', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('removes a bare fence', () => {
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('trims surrounding whitespace', () => {
    expect(stripCodeFence('  \n{"a":1}\n  ')).toBe('{"a":1}');
  });
});

describe('pcmToWav', () => {
  const pcm = Buffer.alloc(48_000, 1); // one second of 16-bit mono at 24 kHz

  it('adds a 44 byte RIFF header', () => {
    const wav = pcmToWav(pcm, 24_000);
    expect(wav.length).toBe(pcm.length + 44);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.subarray(36, 40).toString()).toBe('data');
  });

  it('writes the sample rate and derived byte rate it was given', () => {
    const wav = pcmToWav(pcm, 16_000);
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt32LE(28)).toBe(32_000);
  });

  it('declares mono 16-bit PCM', () => {
    const wav = pcmToWav(pcm, 24_000);
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
  });

  it('records the payload length in both size fields', () => {
    const wav = pcmToWav(pcm, 24_000);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.readUInt32LE(4)).toBe(pcm.length + 36);
  });
});

describe('daily allowances', () => {
  it('uses the §10.1 defaults', () => {
    const defaults = env({});
    expect(defaults.AI_DAILY_TUTOR_MESSAGES).toBe(20);
    expect(defaults.AI_DAILY_WRITING_SUBMISSIONS).toBe(3);
    expect(defaults.AI_DAILY_ROLEPLAY_SESSIONS).toBe(10);
  });

  it('can be overridden by configuration', () => {
    expect(env({ AI_DAILY_TUTOR_MESSAGES: '5' }).AI_DAILY_TUTOR_MESSAGES).toBe(5);
  });
});

describe('speech provider split (D-053)', () => {
  it('uses Gemini for speech when text is on Gemini too', () => {
    const single = env({ AI_API_KEY: 'k' });
    expect(speechProviderName(single)).toBe('gemini');
    expect(speechApiKey(single)).toBe('k');
    expect(createSpeechProvider(single)?.name).toBe('gemini');
  });

  it('turns speech off when text runs on a provider that cannot speak', () => {
    // This is the whole point: Groq has no speech, so saying so is better than
    // quietly using the Groq key against Gemini's endpoint.
    const groq = env({ AI_PROVIDER: 'groq', AI_API_KEY: 'groq-key' });
    expect(speechProviderName(groq)).toBe('none');
    expect(createSpeechProvider(groq)).toBeNull();
    expect(isProviderConfigured(groq, 'tts')).toBe(false);
  });

  it('keeps speech on Gemini while text runs on Groq, given its own key', () => {
    // The configuration the learner asked for: cheap text elsewhere, Gemini
    // quota reserved for the thing only Gemini can do.
    const split = env({
      AI_PROVIDER: 'groq',
      AI_API_KEY: 'groq-key',
      AI_SPEECH_PROVIDER: 'gemini',
      AI_SPEECH_API_KEY: 'gemini-key',
    });
    expect(createProvider(split).name).toBe('groq');
    expect(createSpeechProvider(split)?.name).toBe('gemini');
    expect(speechApiKey(split)).toBe('gemini-key');
    expect(isProviderConfigured(split, 'stt')).toBe(true);
  });

  it('does not let the text key leak into speech when they are different', () => {
    const split = env({
      AI_PROVIDER: 'groq',
      AI_API_KEY: 'groq-key',
      AI_SPEECH_PROVIDER: 'gemini',
      AI_SPEECH_API_KEY: 'gemini-key',
    });
    expect(aiApiKey(split)).toBe('groq-key');
    expect(speechApiKey(split)).not.toBe('groq-key');
  });

  it('reports speech unconfigured when the provider is set but the key is not', () => {
    const missing = env({ AI_PROVIDER: 'groq', AI_SPEECH_PROVIDER: 'gemini' });
    expect(createSpeechProvider(missing)?.isConfigured()).toBe(false);
    expect(isProviderConfigured(missing, 'tts')).toBe(false);
  });

  it('honours an explicit off switch', () => {
    const off = env({ AI_API_KEY: 'k', AI_SPEECH_PROVIDER: 'none' });
    expect(createSpeechProvider(off)).toBeNull();
    expect(isProviderConfigured(off, 'stt')).toBe(false);
  });

  it('names Azure when its credentials are present, but does not pretend it works', () => {
    const azure = env({
      AI_PROVIDER: 'groq',
      AI_API_KEY: 'k',
      AZURE_SPEECH_KEY: 'a',
      AZURE_SPEECH_REGION: 'southeastasia',
    });
    expect(speechProviderName(azure)).toBe('azure');
    // Nothing implements Azure speech, so both answers say so consistently.
    expect(createSpeechProvider(azure)).toBeNull();
    expect(isProviderConfigured(azure, 'tts')).toBe(false);
  });
});

describe('GitHub Models', () => {
  it('is selectable and speaks the OpenAI shape', () => {
    const github = createProvider(env({ AI_PROVIDER: 'github', AI_API_KEY: 'ghp_x' }));
    expect(github.name).toBe('github');
    expect(github.isConfigured()).toBe(true);
    expect(github.speak).toBeUndefined();
  });

  it('is unconfigured without a token', () => {
    expect(createProvider(env({ AI_PROVIDER: 'github' })).isConfigured()).toBe(false);
  });
});
