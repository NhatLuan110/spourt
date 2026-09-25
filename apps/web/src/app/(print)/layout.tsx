import '../chinese-theme.css';
import './print.css';

/**
 * Khung cho các trang dành để in. Không sidebar, không thanh dưới, không nền —
 * những thứ đó vừa tốn mực vừa làm lệch khổ giấy. Xác thực vẫn chạy vì
 * AuthProvider nằm ở layout gốc.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-root">{children}</div>;
}
