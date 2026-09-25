import '../../chinese-theme.css';

/**
 * Khung của ngăn tiếng Trung.
 *
 * Không tự vẽ nền hay thanh điều hướng con nữa: nền danh thắng theo route và bộ
 * điều hướng của ngăn đều do `(app)/layout.tsx` lo, nên ở đây chỉ còn việc nạp
 * biến riêng cho chữ Hán và ô tập viết.
 */
export default function ChineseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
