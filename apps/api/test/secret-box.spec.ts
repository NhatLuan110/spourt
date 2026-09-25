import { describe, expect, it } from 'vitest';
import { SecretBoxService, maskKey } from '@app/infra/crypto/secret-box.service';

/**
 * A learner's AI key is the one secret this app stores reversibly, so the
 * encryption is tested directly rather than only through the settings endpoint.
 */

function boxWith(secret: string): SecretBoxService {
  const previous = process.env['SECRET_ENCRYPTION_KEY'];
  process.env['SECRET_ENCRYPTION_KEY'] = secret;
  process.env['DATABASE_URL'] ??= 'postgresql://x/y';
  const box = new SecretBoxService();
  if (previous === undefined) delete process.env['SECRET_ENCRYPTION_KEY'];
  else process.env['SECRET_ENCRYPTION_KEY'] = previous;
  return box;
}

const KEY = 'test-api-key-for-encryption-only-1234567890';

describe('SecretBoxService', () => {
  const box = boxWith('a-test-encryption-secret-32-chars');

  it('round-trips a key unchanged', () => {
    expect(box.decrypt(box.encrypt(KEY))).toBe(KEY);
  });

  it('never stores the plaintext', () => {
    const stored = box.encrypt(KEY);
    expect(stored).not.toContain(KEY);
    expect(stored).not.toContain(KEY.slice(0, 12));
  });

  it('produces a different ciphertext each time, because the IV is random', () => {
    expect(box.encrypt(KEY)).not.toBe(box.encrypt(KEY));
  });

  it('tags the format with a version, so the key can be rotated later', () => {
    expect(box.encrypt(KEY).startsWith('v1.')).toBe(true);
    expect(box.encrypt(KEY).split('.')).toHaveLength(4);
  });

  it('refuses a ciphertext that was tampered with, rather than returning garbage', () => {
    const stored = box.encrypt(KEY);
    const parts = stored.split('.');
    // Flip one character of the ciphertext body.
    const body = parts[3] ?? '';
    parts[3] = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
    expect(box.decrypt(parts.join('.'))).toBeNull();
  });

  it('refuses a ciphertext encrypted under a different key', () => {
    const other = boxWith('a-different-encryption-secret-32b');
    expect(box.decrypt(other.encrypt(KEY))).toBeNull();
  });

  it('returns null for a malformed value instead of throwing', () => {
    // A 500 on every request is a worse answer than "please re-enter your key".
    expect(box.decrypt('')).toBeNull();
    expect(box.decrypt('not-encrypted-at-all')).toBeNull();
    expect(box.decrypt('v2.a.b.c')).toBeNull();
    expect(box.decrypt('v1.only.three')).toBeNull();
  });

  it('handles an empty plaintext', () => {
    expect(box.decrypt(box.encrypt(''))).toBe('');
  });

  it('handles non-ASCII, since a key is not guaranteed to be ASCII', () => {
    expect(box.decrypt(box.encrypt('khoá-tiếng-việt-áàảãạ'))).toBe('khoá-tiếng-việt-áàảãạ');
  });

  it('compares secrets in constant time', () => {
    expect(box.matches('abc', 'abc')).toBe(true);
    expect(box.matches('abc', 'abd')).toBe(false);
    expect(box.matches('abc', 'abcd')).toBe(false);
  });
});

describe('maskKey', () => {
  it('shows enough to recognise the key and no more', () => {
    const masked = maskKey(KEY);
    expect(masked).toBe('test-a…7890');
    expect(masked.length).toBeLessThan(KEY.length / 2);
  });

  it('hides a short key entirely rather than revealing most of it', () => {
    expect(maskKey('short')).toBe('••••');
  });

  it('ignores surrounding whitespace', () => {
    expect(maskKey(`  ${KEY}  `)).toBe(maskKey(KEY));
  });
});
