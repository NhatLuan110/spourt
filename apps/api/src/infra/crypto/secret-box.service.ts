import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { validateEnv } from '@app/infra/config/env';

/**
 * Symmetric encryption for secrets the server must be able to read back —
 * currently only a learner's own AI provider key (D-052).
 *
 * A password would be hashed, not encrypted, because nothing needs to recover
 * it. An API key is different: the server has to send it to the provider, so it
 * has to be reversible. AES-256-GCM is used rather than CBC because it
 * authenticates as well as encrypts: a tampered ciphertext fails to decrypt
 * instead of producing plausible garbage that would then be sent to Google.
 *
 * The stored format is `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version
 * prefix exists so the key can be rotated later without guessing which rows are
 * in which format.
 */
@Injectable()
export class SecretBoxService {
  private readonly logger = new Logger(SecretBoxService.name);
  private readonly key: Buffer;

  constructor() {
    const env = validateEnv(process.env);
    // SECRET_ENCRYPTION_KEY is preferred; COOKIE_SECRET is the fallback so a
    // development machine works with no extra configuration. Both are hashed to
    // exactly 32 bytes, so any length of input is acceptable.
    const material = env.SECRET_ENCRYPTION_KEY ?? env.COOKIE_SECRET;
    if (!env.SECRET_ENCRYPTION_KEY && env.NODE_ENV === 'production') {
      this.logger.warn(
        'SECRET_ENCRYPTION_KEY chưa đặt — đang dùng COOKIE_SECRET. ' +
          'Đổi COOKIE_SECRET sẽ làm mọi khoá AI đã lưu không đọc được nữa.',
      );
    }
    this.key = createHash('sha256').update(material).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', b64(iv), b64(tag), b64(ciphertext)].join('.');
  }

  /**
   * Returns null rather than throwing when the value cannot be read.
   *
   * The realistic cause is a rotated `COOKIE_SECRET`, and the right response is
   * "your saved key can no longer be read, please re-enter it" — not a 500 on
   * every request the learner makes.
   */
  decrypt(stored: string): string | null {
    const parts = stored.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;

    try {
      const iv = unb64(parts[1] ?? '');
      const tag = unb64(parts[2] ?? '');
      const ciphertext = unb64(parts[3] ?? '');
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // A wrong key, a truncated row, or a tampered value all land here.
      return null;
    }
  }

  /** Constant-time comparison, for anywhere a secret is checked rather than read. */
  matches(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
}

/**
 * The masked form shown in settings: enough to recognise which key is saved,
 * never enough to use it.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••';
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function b64(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function unb64(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
