/**
 * Bộ icon vẽ tay cho điều hướng và các nhãn mục.
 *
 * Trước đây mỗi mục dùng một emoji. Emoji không phải hệ icon: mỗi hệ điều hành
 * vẽ một kiểu, độ dày nét vênh nhau, màu do phông quyết định nên không theo
 * được bảng màu, và kích thước quang học lệch hẳn so với chữ bên cạnh. Bộ này
 * vẽ trên lưới 24, nét 1.75, đầu và góc bo tròn, tô bằng `currentColor` nên
 * thừa hưởng màu của phần tử cha.
 */
export type IconName =
  | 'home'
  | 'vocabulary'
  | 'wordClass'
  | 'listening'
  | 'speaking'
  | 'writing'
  | 'grammar'
  | 'reading'
  | 'sentence'
  | 'tutor'
  | 'tests'
  | 'analytics'
  | 'admin'
  | 'user'
  | 'brush'
  | 'character'
  | 'tone'
  | 'print'
  | 'search'
  | 'route'
  | 'radical'
  | 'deck';

const PATHS: Record<IconName, React.ReactNode> = {
  // Mầm cây — hình ảnh chủ đạo của sản phẩm.
  home: (
    <>
      <path d="M12 21v-7" />
      <path d="M12 14c0-3 2-5 5-5 0 3-2 5-5 5Z" />
      <path d="M12 16c0-2.5-1.8-4.5-4.5-4.5 0 2.5 1.8 4.5 4.5 4.5Z" />
      <path d="M6 21h12" />
    </>
  ),
  vocabulary: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </>
  ),
  wordClass: (
    <>
      <path d="M5 18 9.5 6l4.5 12" />
      <path d="M6.8 14h5.4" />
      <path d="M17 10v8" />
      <path d="M17 10a3 3 0 1 1 0 6" />
    </>
  ),
  listening: (
    <>
      <path d="M4 13a8 8 0 0 1 16 0" />
      <path d="M4 13v3a2.5 2.5 0 0 0 2.5 2.5H7V13Z" />
      <path d="M20 13v3a2.5 2.5 0 0 1-2.5 2.5H17V13Z" />
    </>
  ),
  speaking: (
    <>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </>
  ),
  writing: (
    <>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5Z" />
      <path d="M13.5 7 17 10.5" />
    </>
  ),
  grammar: (
    <>
      <path d="M4 19h16" />
      <path d="M6 19V9l6-5 6 5v10" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  reading: (
    <>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5V18c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2V4.5c-4.5 0-6.5.5-8 2Z" />
      <path d="M12 6.5V20" />
    </>
  ),
  sentence: (
    <>
      <path d="M4 8h11a4 4 0 0 1 0 8H8" />
      <path d="m10.5 13.5-2.5 2.5 2.5 2.5" />
    </>
  ),
  tutor: (
    <>
      <path d="M20 12.5a7.5 6.5 0 0 1-7.5 6.5 9 9 0 0 1-2.6-.37L5 20.5l1.2-3.4A6.3 6.3 0 0 1 5 12.5 7.5 6.5 0 0 1 12.5 6 7.5 6.5 0 0 1 20 12.5Z" />
      <path d="M9.5 12.5h6" />
      <path d="M9.5 9.8h3.5" />
    </>
  ),
  tests: (
    <>
      <path d="M7 3h7l5 5v13H7Z" />
      <path d="M14 3v5h5" />
      <path d="m10 13 2 2 3.5-3.5" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6" />
      <path d="M12 20V6" />
      <path d="M17 20v-9" />
    </>
  ),
  admin: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  // Bút lông — phần tập viết chữ Hán.
  brush: (
    <>
      <path d="M14.5 4.5 19 9l-6.5 6.5-4.5-4.5Z" />
      <path d="M8 11 5.5 17.5a1 1 0 0 0 1.3 1.3L13 16" />
      <path d="M4 21h5" />
    </>
  ),
  // Ô 田字格 — tra chữ.
  character: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 4v16M4 12h16" strokeDasharray="2.5 2.5" />
    </>
  ),
  // Đường cong thanh điệu.
  tone: (
    <>
      <path d="M3 15c2.5 0 3-6 5.5-6S11 15 13.5 15 16 7 18.5 7 21 11 21 11" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V4h10v5" />
      <path d="M7 18H5.5A1.5 1.5 0 0 1 4 16.5v-5A2.5 2.5 0 0 1 6.5 9h11a2.5 2.5 0 0 1 2.5 2.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
      <rect x="7" y="14" width="10" height="7" rx="1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
  // Cột mốc lộ trình.
  route: (
    <>
      <path d="M7 21V8" />
      <path d="M7 4.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
      <path d="M17 6v8" />
      <path d="M17 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
      <path d="M9 6h5a3 3 0 0 1 3 3" />
    </>
  ),
  // Bộ thủ, lượng từ.
  radical: (
    <>
      <path d="M4 7h16" />
      <path d="M12 4v16" />
      <path d="M8 12c0 4-1.5 6-4 7" />
      <path d="M16 12c0 4 1.5 6 4 7" />
    </>
  ),
  deck: (
    <>
      <rect x="3" y="7" width="14" height="12" rx="2" />
      <path d="M7 4h11a3 3 0 0 1 3 3v9" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
