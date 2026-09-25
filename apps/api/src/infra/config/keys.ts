import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const KEY_DIR = resolve(process.cwd(), '.keys');
const PRIVATE_PATH = join(KEY_DIR, 'jwt-private.pem');
const PUBLIC_PATH = join(KEY_DIR, 'jwt-public.pem');

/**
 * §11 — access tokens are RS256. Production supplies the keys through the
 * environment; development generates a throwaway pair into .keys/ (gitignored)
 * so a fresh clone boots with no manual setup.
 */
export function ensureJwtKeys(): { privateKey: string; publicKey: string } {
  if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
    return {
      privateKey: normalize(process.env.JWT_PRIVATE_KEY),
      publicKey: normalize(process.env.JWT_PUBLIC_KEY),
    };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set in production');
  }

  if (!existsSync(PRIVATE_PATH) || !existsSync(PUBLIC_PATH)) {
    mkdirSync(KEY_DIR, { recursive: true });
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    writeFileSync(PRIVATE_PATH, privateKey, 'utf8');
    writeFileSync(PUBLIC_PATH, publicKey, 'utf8');
  }

  const privateKey = readFileSync(PRIVATE_PATH, 'utf8');
  const publicKey = readFileSync(PUBLIC_PATH, 'utf8');
  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.JWT_PUBLIC_KEY = publicKey;
  return { privateKey, publicKey };
}

/** Environment variables often carry \n as two characters. */
function normalize(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}
