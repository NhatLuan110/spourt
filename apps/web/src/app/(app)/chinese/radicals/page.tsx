'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HSK_LEVEL_LIST } from '@sprout/shared';
import type { HskLevel } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Hai thứ mà người Việt học tiếng Trung hay bỏ qua rồi trả giá về sau:
 *
 * - Bộ thủ: 214 bộ là bảng chữ cái thật của chữ Hán. Nhận ra bộ là đoán được
 *   nghĩa và tra được từ điển giấy.
 * - Lượng từ: tiếng Việt cũng có (con, cái, quyển) nhưng không trùng với tiếng
 *   Trung, nên phải học riêng theo từng danh từ.
 */
const COMMON_RADICALS = [
  { radical: '氵', hanViet: 'thuỷ', meaning: 'nước', examples: '河 sông · 海 biển · 洗 rửa' },
  { radical: '亻', hanViet: 'nhân', meaning: 'người', examples: '他 anh ấy · 你 bạn · 住 ở' },
  { radical: '口', hanViet: 'khẩu', meaning: 'miệng, lời nói', examples: '吃 ăn · 喝 uống · 叫 gọi' },
  { radical: '心', hanViet: 'tâm', meaning: 'tim, cảm xúc', examples: '想 nghĩ · 怕 sợ · 忙 bận' },
  { radical: '扌', hanViet: 'thủ', meaning: 'tay, động tác tay', examples: '打 đánh · 找 tìm · 拿 cầm' },
  { radical: '木', hanViet: 'mộc', meaning: 'cây, gỗ', examples: '树 cây · 桌 bàn · 林 rừng' },
  { radical: '女', hanViet: 'nữ', meaning: 'nữ giới', examples: '妈 mẹ · 好 tốt · 姐 chị' },
  { radical: '讠', hanViet: 'ngôn', meaning: 'lời nói', examples: '说 nói · 语 ngữ · 谢 cảm ơn' },
  { radical: '钅', hanViet: 'kim', meaning: 'kim loại', examples: '钱 tiền · 钟 chuông · 银 bạc' },
  { radical: '艹', hanViet: 'thảo', meaning: 'cỏ, thực vật', examples: '花 hoa · 茶 trà · 菜 rau' },
  { radical: '日', hanViet: 'nhật', meaning: 'mặt trời, ngày', examples: '时 giờ · 明 sáng · 早 sớm' },
  { radical: '月', hanViet: 'nguyệt', meaning: 'mặt trăng, thân thể', examples: '朋 bạn · 脸 mặt · 服 phục' },
  { radical: '食/饣', hanViet: 'thực', meaning: 'ăn uống', examples: '饭 cơm · 饿 đói · 饺 sủi cảo' },
  { radical: '车', hanViet: 'xa', meaning: 'xe cộ', examples: '车 xe · 轮 bánh xe · 转 quay' },
  { radical: '门', hanViet: 'môn', meaning: 'cửa', examples: '们 (số nhiều) · 问 hỏi · 间 gian' },
  { radical: '宀', hanViet: 'miên', meaning: 'mái nhà', examples: '家 nhà · 安 an · 客 khách' },
];

const MEASURE_WORDS = [
  { word: '个', hanViet: 'cá', use: 'Dùng chung cho hầu hết mọi thứ khi chưa nhớ lượng từ đúng.', example: '一个人 một người' },
  { word: '本', hanViet: 'bản', use: 'Sách vở, tạp chí — thứ có gáy đóng.', example: '两本书 hai quyển sách' },
  { word: '张', hanViet: 'trương', use: 'Vật phẳng: giấy, bàn, vé, giường.', example: '一张票 một cái vé' },
  { word: '件', hanViet: 'kiện', use: 'Áo, việc, đồ vật rời.', example: '三件衣服 ba cái áo' },
  { word: '条', hanViet: 'điều', use: 'Vật dài: đường, sông, cá, quần.', example: '一条鱼 một con cá' },
  { word: '只', hanViet: 'chích', use: 'Động vật nhỏ, và một trong một cặp.', example: '两只猫 hai con mèo' },
  { word: '杯', hanViet: 'bôi', use: 'Đồ uống đựng trong cốc.', example: '一杯水 một cốc nước' },
  { word: '辆', hanViet: 'lượng', use: 'Xe có bánh.', example: '一辆车 một chiếc xe' },
  { word: '双', hanViet: 'song', use: 'Đôi, cặp đi liền nhau.', example: '一双鞋 một đôi giày' },
  { word: '位', hanViet: 'vị', use: 'Người, mang sắc thái kính trọng.', example: '三位老师 ba vị thầy' },
  { word: '次', hanViet: 'thứ', use: 'Số lần xảy ra.', example: '去过两次 đã đi hai lần' },
  { word: '些', hanViet: 'ta', use: 'Một ít, số lượng không xác định.', example: '一些朋友 vài người bạn' },
];

export default function ChineseRadicalsPage() {
  const [tab, setTab] = useState<'radical' | 'measure' | 'strokes'>('radical');
  const [hsk, setHsk] = useState<HskLevel>('HSK1');

  const byStrokes = useQuery({
    queryKey: chineseKeys.hanziList({ hsk, sort: 'strokes', view: 'radicals' }),
    queryFn: () => chineseApi.hanziList({ hsk, sort: 'strokes', page: 1, limit: 60 }),
    enabled: tab === 'strokes',
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">
          Bộ thủ &amp; lượng từ
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">
          Bộ thủ là bảng chữ cái thật của chữ Hán — nhận ra bộ thì đoán được nghĩa. Lượng từ thì
          tiếng Việt cũng có nhưng không trùng, phải học riêng theo từng danh từ.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-[var(--r-md)] bg-[var(--surface-alt)] p-1">
        {(
          [
            ['radical', 'Bộ thủ hay gặp'],
            ['measure', 'Lượng từ'],
            ['strokes', 'Chữ theo số nét'],
          ] as ['radical' | 'measure' | 'strokes', string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'rounded-[var(--r-sm)] px-4 py-2 text-[14px] font-medium transition-colors',
              tab === key
                ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'radical' ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {COMMON_RADICALS.map((item) => (
            <li
              key={item.radical}
              className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-baseline gap-3">
                <span className="hanzi text-[36px] leading-none text-[var(--primary)]">
                  {item.radical}
                </span>
                <div>
                  <p className="text-[15px] font-semibold">{item.hanViet}</p>
                  <p className="text-[13px] text-[var(--text-muted)]">{item.meaning}</p>
                </div>
              </div>
              <p className="hanzi mt-2 text-[14px] text-[var(--text-muted)]">{item.examples}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'measure' ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {MEASURE_WORDS.map((item) => (
            <li
              key={item.word}
              className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-baseline gap-3">
                <span className="hanzi text-[32px] leading-none text-[var(--accent)]">
                  {item.word}
                </span>
                <span className="text-[14px] text-[var(--text-muted)]">{item.hanViet}</span>
              </div>
              <p className="mt-1.5 text-[15px]">{item.use}</p>
              <p className="hanzi mt-1 text-[15px] text-[var(--primary)]">{item.example}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'strokes' ? (
        <>
          <div className="flex flex-wrap gap-1">
            {HSK_LEVEL_LIST.map((level) => (
              <button
                key={level.key}
                type="button"
                onClick={() => setHsk(level.key)}
                className={cn(
                  'rounded-[var(--r-sm)] px-3 py-2 text-[13px] font-medium',
                  hsk === level.key
                    ? 'bg-[var(--primary)] text-[var(--text-inverse)]'
                    : 'bg-[var(--surface-alt)] text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
              >
                HSK {level.number}
              </button>
            ))}
          </div>

          {byStrokes.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
              {byStrokes.data?.data.map((item) => (
                <li key={item.character}>
                  <Link
                    href={`/chinese/hanzi/${encodeURIComponent(item.character)}`}
                    className="flex flex-col items-center rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-2 text-center hover:border-[var(--border-strong)]"
                  >
                    <span className="hanzi text-[30px] leading-tight">{item.character}</span>
                    <span className="text-[12px] text-[var(--text-muted)]">{item.hanViet}</span>
                    <span className="tabular text-[11px] text-[var(--text-subtle)]">
                      {item.strokeCount} nét
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
