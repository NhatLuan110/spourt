import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cn, formatNumber, greetingKey } from '../src/lib/utils';

const MESSAGES_DIR = resolve(__dirname, '../messages');

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('message catalogues', () => {
  const locales = readdirSync(MESSAGES_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace('.json', ''));

  it('ships Vietnamese and English', () => {
    expect(locales.sort()).toEqual(['en', 'vi']);
  });

  it('keeps every key in both languages', () => {
    const vi = flatten(load('vi')).sort();
    const en = flatten(load('en')).sort();
    expect(en).toEqual(vi);
  });

  it('never leaves a translation empty', () => {
    for (const locale of locales) {
      const messages = load(locale);
      const walk = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          expect(value.trim(), `${locale}: ${path}`).not.toBe('');
          return;
        }
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          walk(child, path ? `${path}.${key}` : key);
        }
      };
      walk(messages, '');
    }
  });

  it('uses the same placeholders in both languages', () => {
    const vi = load('vi');
    const en = load('en');
    const placeholders = (value: unknown): string[] =>
      typeof value === 'string' ? [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '') : [];

    const walk = (viNode: unknown, enNode: unknown, path: string): void => {
      if (typeof viNode === 'string') {
        expect(placeholders(enNode).sort(), path).toEqual(placeholders(viNode).sort());
        return;
      }
      for (const [key, child] of Object.entries(viNode as Record<string, unknown>)) {
        walk(child, (enNode as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      }
    };
    walk(vi, en, '');
  });
});

describe('cn', () => {
  it('merges conflicting Tailwind classes, last one winning', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});

describe('greetingKey', () => {
  it('follows the local clock', () => {
    expect(greetingKey(new Date(2026, 2, 10, 8))).toBe('Morning');
    expect(greetingKey(new Date(2026, 2, 10, 13))).toBe('Afternoon');
    expect(greetingKey(new Date(2026, 2, 10, 20))).toBe('Evening');
    expect(greetingKey(new Date(2026, 2, 10, 0))).toBe('Morning');
  });
});

describe('formatNumber', () => {
  it('groups thousands for Vietnamese readers', () => {
    expect(formatNumber(1840)).toMatch(/1.840/);
  });
});
