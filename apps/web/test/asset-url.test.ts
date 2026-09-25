import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaUrl, publicAssetUrl } from '../src/lib/asset-url';

afterEach(() => vi.unstubAllEnvs());

describe('assets on a project Pages domain', () => {
  it('keeps bundled assets within the repository path', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/spourt/');
    expect(publicAssetUrl('/scenery/a.jpg')).toBe('/spourt/scenery/a.jpg');
    expect(publicAssetUrl('/hanzi-data/%E4%BD%A0.json')).toBe('/spourt/hanzi-data/%E4%BD%A0.json');
    expect(mediaUrl('/audio/example.mp3')).toBe('/spourt/audio/example.mp3');
  });
  it('uses the backend origin for generated recordings', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/spourt');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://sprout-api.example/api/v1');
    expect(mediaUrl('/media/speech/test.wav')).toBe('https://sprout-api.example/media/speech/test.wav');
  });
  it('preserves same-origin Next deployments and browser recording URLs', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api/v1');
    expect(mediaUrl('/media/test.wav')).toBe('/media/test.wav');
    for (const url of ['blob:https://example.test/recording', 'https://example.test/a.mp3', '//cdn.example.test/a.mp3', 'data:audio/wav;base64,AA==']) {
      expect(mediaUrl(url)).toBe(url);
    }
  });
});
