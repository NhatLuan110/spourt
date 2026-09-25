import { readFileSync, existsSync } from 'node:fs';

/**
 * Reads a .env file into a plain object.
 *
 * Shared by the standalone scripts, which run outside Nest and so cannot use
 * ConfigModule. It exists as one function because each script had its own copy
 * and every copy had the same bug: values written with surrounding quotes —
 * `DATABASE_URL="postgresql://…"` — kept the quotes, so the URL no longer began
 * with its protocol and Prisma refused it.
 */
export function readEnvFile(path) {
  if (!existsSync(path)) return {};

  const entries = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      if (at < 0) return [line, ''];
      return [line.slice(0, at).trim(), unquote(line.slice(at + 1).trim())];
    });

  return Object.fromEntries(entries);
}

/** Strips one matching pair of surrounding quotes, if present. */
export function unquote(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}
