/**
 * Nạp kho tiếng Trung (D-101) từ `content/chinese/` vào cơ sở dữ liệu.
 *
 * Chạy riêng chứ không gắn vào `seed/index.ts`: kho tiếng Anh và kho tiếng Trung
 * độc lập nhau, và 4991 từ + 2632 chữ mất khá lâu nên không có lý do bắt người
 * chỉ sửa một bài đọc tiếng Anh phải chờ.
 *
 *   pnpm --filter @sprout/api seed:chinese
 */
import { PrismaClient } from '@prisma/client';
import type { HskLevel } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const prisma = new PrismaClient();
const CONTENT_DIR = resolve(process.cwd(), '../../content/chinese');

interface HanziFileEntry {
  char: string;
  traditional?: string;
  hskLevel: number;
  pinyinNumeric?: string;
  hanViet?: string;
  strokeCount?: number;
  meaningVi?: string;
}

interface WordFileEntry {
  simplified: string;
  traditional?: string;
  pinyin: string;
  pinyinNumeric?: string;
  hanViet?: string;
  meaningVi: string;
  meaningEn?: string;
  pos?: string[];
  classifiers?: string[];
  frequencyRank?: number;
  radical?: string;
}

const HAN = /\p{Script=Han}/u;

function hskLevel(level: number): HskLevel {
  return `HSK${level}` as HskLevel;
}

function readYaml<T>(file: string): T {
  return parse(readFileSync(resolve(CONTENT_DIR, file), 'utf8')) as T;
}

async function seedHanzi(): Promise<Map<string, string>> {
  const { characters } = readYaml<{ characters: HanziFileEntry[] }>('hanzi.yaml');

  // createMany một phát cho 2632 chữ nhanh hơn hẳn upsert từng chữ, còn
  // skipDuplicates giữ cho lần chạy lại không nổ vì trùng khoá.
  await prisma.hanzi.createMany({
    data: characters.map((entry) => ({
      character: entry.char,
      traditional: entry.traditional ?? null,
      pinyinNumeric: entry.pinyinNumeric ?? null,
      hanViet: entry.hanViet ?? null,
      strokeCount: entry.strokeCount ?? null,
      meaningVi: entry.meaningVi ?? null,
      hskLevel: hskLevel(entry.hskLevel),
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.hanzi.findMany({ select: { id: true, character: true } });
  console.log(`  hanzi: ${rows.length} chữ`);
  return new Map(rows.map((row) => [row.character, row.id]));
}

async function seedWords(hanziIds: Map<string, string>): Promise<void> {
  let total = 0;

  for (const level of [1, 2, 3, 4, 5, 6]) {
    const { words } = readYaml<{ words: WordFileEntry[] }>(`hsk${level}.yaml`);

    await prisma.chineseWord.createMany({
      data: words.map((word) => ({
        simplified: word.simplified,
        traditional: word.traditional ?? null,
        pinyin: word.pinyin,
        pinyinNumeric: word.pinyinNumeric ?? null,
        hanViet: word.hanViet ?? null,
        meaningVi: word.meaningVi,
        meaningEn: word.meaningEn ?? null,
        hskLevel: hskLevel(level),
        frequencyRank: word.frequencyRank ?? null,
        radical: word.radical ?? null,
        pos: word.pos ?? [],
        classifiers: word.classifiers ?? [],
      })),
      skipDuplicates: true,
    });

    total += words.length;
    console.log(`  hsk${level}: ${words.length} từ`);
  }

  // ---- nối từ với chữ ------------------------------------------------------
  const stored = await prisma.chineseWord.findMany({ select: { id: true, simplified: true } });
  const links: { wordId: string; hanziId: string; position: number }[] = [];
  for (const word of stored) {
    let position = 0;
    for (const char of word.simplified) {
      if (!HAN.test(char)) continue;
      const hanziId = hanziIds.get(char);
      if (hanziId) links.push({ wordId: word.id, hanziId, position });
      position += 1;
    }
  }

  // Postgres có trần 65535 tham số cho một câu lệnh, ba cột nên chia lô 10 000.
  for (let start = 0; start < links.length; start += 10_000) {
    await prisma.chineseWordHanzi.createMany({
      data: links.slice(start, start + 10_000),
      skipDuplicates: true,
    });
  }

  console.log(`  liên kết từ ↔ chữ: ${links.length}`);
  console.log(`\n${total} từ tiếng Trung đã nạp.`);
}

async function main(): Promise<void> {
  console.log('Nạp kho tiếng Trung...');
  const hanziIds = await seedHanzi();
  await seedWords(hanziIds);
  console.log('Xong.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
