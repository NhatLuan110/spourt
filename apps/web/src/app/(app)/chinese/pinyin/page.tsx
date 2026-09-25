'use client';

import Link from 'next/link';
import { PINYIN_TONES } from '@sprout/shared';

/**
 * Bài mở đầu cho người chưa biết một chữ tiếng Trung nào: đọc được pinyin thì
 * mới tra được từ điển và học tiếp được. Cách giải thích bám vào tiếng Việt —
 * người Việt sẵn có sáu thanh nên chỉ cần ánh xạ sang bốn thanh Trung.
 */
export default function PinyinPage() {
  return (
    <div className="space-y-5">
      <header className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="font-[family-name:var(--font-heading)] text-[26px] text-[var(--text)]">
          Pinyin và thanh điệu
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Pinyin là cách ghi âm tiếng Trung bằng chữ Latinh. Đọc được pinyin là đọc được mọi
          từ trong app này. Người Việt có lợi thế lớn: tiếng Việt đã có thanh điệu, nên bốn
          thanh tiếng Trung chỉ là ánh xạ lại thứ bạn vốn phát âm hằng ngày.
        </p>
      </header>

      <Section title="1 · Bốn thanh và thanh nhẹ" note="Sai thanh là sai từ: mā là mẹ, mà mǎ là con ngựa.">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {PINYIN_TONES.map((tone) => (
            <li
              key={tone.tone}
              className="rounded-[var(--r-md)] p-4"
              // Màu thanh điệu chính là nội dung của thẻ, nên để nó nhuộm cả nền
              // thay vì gạch một vạch màu ở mép — vạch màu là trang trí, không dạy gì.
              style={{ backgroundColor: `color-mix(in oklab, var(${tone.colorToken}) 12%, var(--surface))` }}
            >
              <div className="flex items-baseline gap-3">
                <span className="text-[34px] leading-none" style={{ color: `var(${tone.colorToken})` }}>
                  {tone.mark}
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-[var(--text)]">{tone.nameVi}</p>
                  <p className="text-[13px] text-[var(--text-muted)]">{tone.hint}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-2 text-[14px] font-semibold text-[var(--text)]">Đối chiếu với thanh tiếng Việt</p>
          <ul className="grid gap-1.5 text-[14px] text-[var(--text-muted)] sm:grid-cols-2">
            <li>Thanh 1 <span className="text-[var(--text-subtle)]">ā</span> — gần thanh ngang, nhưng cao hơn và giữ đều.</li>
            <li>Thanh 2 <span className="text-[var(--text-subtle)]">á</span> — gần thanh sắc.</li>
            <li>Thanh 3 <span className="text-[var(--text-subtle)]">ǎ</span> — gần thanh hỏi, hạ xuống rồi nhấc lên.</li>
            <li>Thanh 4 <span className="text-[var(--text-subtle)]">à</span> — gần thanh huyền nhưng dứt khoát và đi xuống mạnh.</li>
          </ul>
        </div>
      </Section>

      <Section
        title="2 · Những âm người Việt hay đọc sai"
        note="Đây là chỗ mất điểm nhiều nhất khi thi nói, sửa sớm thì đỡ phải sửa lại."
      >
        <div className="grid gap-2 md:grid-cols-2">
          {PITFALLS.map((item) => (
            <div key={item.sound} className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-[18px] font-semibold text-[var(--text)]">{item.sound}</p>
              <p className="mt-1 text-[14px] text-[var(--text-muted)]">{item.how}</p>
              <p className="mt-1 text-[13px] text-[var(--text-subtle)]">Ví dụ: {item.example}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="3 · Quy tắc đặt dấu thanh" note="Biết luật này thì viết pinyin không bao giờ sai chỗ.">
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px] text-[var(--text-muted)]">
          <li>Có <b className="text-[var(--text)]">a</b> thì dấu luôn nằm trên <b className="text-[var(--text)]">a</b>: hǎo, xiǎng.</li>
          <li>Không có a thì tới <b className="text-[var(--text)]">o</b> hoặc <b className="text-[var(--text)]">e</b>: duō, xiè.</li>
          <li>Vần <b className="text-[var(--text)]">iu</b> và <b className="text-[var(--text)]">ui</b>: dấu rơi vào chữ cái cuối — liù, guì.</li>
          <li>Còn lại đặt vào nguyên âm duy nhất: nǐ, shū.</li>
        </ol>
      </Section>

      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-[16px] font-semibold text-[var(--text)]">Đọc được pinyin rồi thì đi tiếp</p>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          HSK 1 chỉ có 150 từ và 178 chữ. Học hết là nói được những câu đầu tiên.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/chinese/hsk/HSK1"
            className="rounded-[var(--r-sm)] bg-white px-4 py-2 text-[14px] font-medium text-[var(--text-inverse)]"
          >
            Vào HSK 1
          </Link>
          <Link
            href="/chinese/writing?source=hsk&hsk=HSK1"
            className="rounded-[var(--r-sm)] border border-[var(--border-strong)] px-4 py-2 text-[14px] font-medium text-[var(--text)]"
          >
            In bảng tập viết HSK 1
          </Link>
        </div>
      </div>
    </div>
  );
}

const PITFALLS = [
  {
    sound: 'zh / ch / sh',
    how: 'Cong lưỡi lên chạm vòm miệng. Tiếng Việt không có âm này; đừng đọc thành "gi", "ch", "s" của tiếng Việt.',
    example: '中 zhōng, 吃 chī, 是 shì',
  },
  {
    sound: 'z / c / s',
    how: 'Lưỡi phẳng, đầu lưỡi chạm sau răng cửa. Khác hẳn nhóm cong lưỡi ở trên.',
    example: '在 zài, 从 cóng, 三 sān',
  },
  {
    sound: 'ü (viết là u sau j q x y)',
    how: 'Môi tròn như đọc "u" nhưng lưỡi ở vị trí "i". Gần âm "uy" nói nhanh.',
    example: '女 nǚ, 去 qù, 学 xué',
  },
  {
    sound: 'r',
    how: 'Cong lưỡi, không rung như "r" tiếng Việt miền Nam, nghe gần "ưr".',
    example: '人 rén, 日 rì',
  },
  {
    sound: 'x / q / j',
    how: 'Đưa lưỡi ra trước, gần âm "x", "ch", "gi" nhưng mềm và bẹt hơn.',
    example: '谢 xiè, 七 qī, 家 jiā',
  },
  {
    sound: 'ng cuối vần',
    how: 'Tiếng Việt có sẵn âm này, giữ nguyên. Nhưng phân biệt rõ -n và -ng, sai là khác từ.',
    example: '三 sān ≠ 上 shàng',
  },
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-[19px] font-semibold text-[var(--text)]">{title}</h2>
      {note ? <p className="mb-3 mt-0.5 text-[14px] text-[var(--text-muted)]">{note}</p> : null}
      {children}
    </section>
  );
}
