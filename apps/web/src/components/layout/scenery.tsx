'use client';

import { publicAssetUrl } from '@/lib/asset-url';

import { useEffect, useState } from 'react';

export interface Scene {
  slug: string;
  nameVi: string;
  placeVi: string;
  credit: string;
  license: string;
}

/** Danh thắng Việt Nam — nền của ngăn tiếng Anh. */
export const VIETNAM_SCENES: Scene[] = [
  { slug: 'ha-long', nameVi: 'Vịnh Hạ Long', placeVi: 'Quảng Ninh', credit: 'Jakub Hałun', license: 'CC BY 4.0' },
  { slug: 'trang-an', nameVi: 'Tràng An', placeVi: 'Ninh Bình', credit: 'Jakub Hałun', license: 'CC BY 4.0' },
  { slug: 'hoi-an', nameVi: 'Phố cổ Hội An', placeVi: 'Quảng Nam', credit: 'lumoplank', license: 'CC0' },
  { slug: 'sapa', nameVi: 'Ruộng bậc thang Sa Pa', placeVi: 'Lào Cai', credit: 'Eerin25', license: 'CC0' },
  { slug: 'phong-nha', nameVi: 'Phong Nha — Kẻ Bàng', placeVi: 'Quảng Bình', credit: 'Andre Hospers', license: 'CC BY 4.0' },
  { slug: 'golden-bridge', nameVi: 'Cầu Vàng', placeVi: 'Bà Nà, Đà Nẵng', credit: 'Ray in Manila', license: 'CC BY 2.0' },
  { slug: 'hue', nameVi: 'Đại Nội Huế', placeVi: 'Thừa Thiên Huế', credit: 'CEphoto, Uwe Aranas', license: 'CC BY-SA 3.0' },
  { slug: 'hoan-kiem', nameVi: 'Hồ Hoàn Kiếm', placeVi: 'Hà Nội', credit: 'Daderot', license: 'CC0' },
  { slug: 'my-son', nameVi: 'Thánh địa Mỹ Sơn', placeVi: 'Quảng Nam', credit: 'Tycho', license: 'CC BY-SA 3.0' },
  { slug: 'da-lat', nameVi: 'Đà Lạt', placeVi: 'Lâm Đồng', credit: 'Trương Minh Khải', license: 'CC BY 4.0' },
  { slug: 'phu-quoc', nameVi: 'Phú Quốc', placeVi: 'Kiên Giang', credit: 'Vivu Vietnam', license: 'CC BY-SA 4.0' },
  { slug: 'ban-gioc', nameVi: 'Thác Bản Giốc', placeVi: 'Cao Bằng', credit: 'Adam Jones', license: 'CC BY-SA 2.0' },
  { slug: 'mekong', nameVi: 'Đồng bằng sông Cửu Long', placeVi: 'ảnh vệ tinh Sentinel-2', credit: 'Copernicus / EU', license: 'Attribution' },
  { slug: 'nha-trang', nameVi: 'Vịnh Nha Trang', placeVi: 'Khánh Hoà', credit: 'Minh Duc Ly', license: 'Phạm vi công cộng' },
  { slug: 'hcmc', nameVi: 'TP Hồ Chí Minh', placeVi: 'bến Bạch Đằng', credit: 'Pimnl', license: 'CC0' },
  { slug: 'mui-ne', nameVi: 'Đồi cát Mũi Né', placeVi: 'Bình Thuận', credit: 'Vyacheslav Argenberg', license: 'CC BY 4.0' },
];

/** Danh thắng Trung Quốc — nền của ngăn tiếng Trung. */
export const CHINA_SCENES: Scene[] = [
  { slug: 'li-river', nameVi: 'Sông Ly', placeVi: 'Quế Lâm, Quảng Tây', credit: 'Luka Peternel', license: 'CC BY-SA 4.0' },
  { slug: 'zhangjiajie', nameVi: 'Trương Gia Giới', placeVi: 'Hồ Nam', credit: 'Kuruman', license: 'CC BY 2.0' },
  { slug: 'great-wall', nameVi: 'Vạn Lý Trường Thành', placeVi: 'Kim Sơn Lĩnh, Hà Bắc', credit: 'Jakub Hałun', license: 'CC BY-SA 3.0' },
  { slug: 'huangshan', nameVi: 'Hoàng Sơn', placeVi: 'An Huy', credit: 'lienyuan lee', license: 'CC BY 3.0' },
  { slug: 'jiuzhaigou', nameVi: 'Cửu Trại Câu', placeVi: 'Tứ Xuyên', credit: 'Suicasmo', license: 'CC0' },
  { slug: 'west-lake', nameVi: 'Tây Hồ', placeVi: 'Hàng Châu, Chiết Giang', credit: 'Y Chen', license: 'CC BY-SA 4.0' },
  { slug: 'forbidden-city', nameVi: 'Tử Cấm Thành', placeVi: 'Bắc Kinh', credit: 'Pixelflake', license: 'CC BY-SA 3.0' },
  { slug: 'shanghai', nameVi: 'Bến Thượng Hải', placeVi: 'Thượng Hải', credit: 'Ernest Jourdier', license: 'CC BY 4.0' },
  { slug: 'potala', nameVi: 'Cung điện Potala', placeVi: 'Lhasa, Tây Tạng', credit: 'Göran Höglund', license: 'CC BY 2.0' },
  { slug: 'terracotta', nameVi: 'Đội quân đất nung', placeVi: 'Tây An, Thiểm Tây', credit: 'CEphoto, Uwe Aranas', license: 'CC BY-SA 3.0' },
  { slug: 'leshan', nameVi: 'Lạc Sơn Đại Phật', placeVi: 'Tứ Xuyên', credit: 'Calistemon', license: 'CC BY-SA 4.0' },
  { slug: 'danxia', nameVi: 'Đan Hà Trương Dịch', placeVi: 'Cam Túc', credit: 'iamangela9', license: 'CC0' },
  { slug: 'summer-palace', nameVi: 'Di Hoà Viên', placeVi: 'Bắc Kinh', credit: 'HoweyYuan', license: 'CC BY-SA 4.0' },
  { slug: 'temple-heaven', nameVi: 'Thiên Đàn', placeVi: 'Bắc Kinh', credit: 'Lloyd Tudor', license: 'CC BY-SA 4.0' },
  { slug: 'longji', nameVi: 'Ruộng bậc thang Long Tích', placeVi: 'Quảng Tây', credit: 'Immanuel Giel', license: 'CC BY-SA 4.0' },
  { slug: 'hongcun', nameVi: 'Làng cổ Hoành Thôn', placeVi: 'An Huy', credit: '颐园新居', license: 'CC BY-SA 4.0' },
];

const SCENE_MS = 14_000;

/**
 * Nền động phía sau một ngăn học: ảnh danh thắng 4K, mỗi cảnh vừa phóng chậm
 * vừa trôi ngang rồi tan sang cảnh kế (Ken Burns).
 *
 * Dùng ảnh tĩnh phóng chậm thay vì tệp video: một clip 4K mười giây nặng vài
 * trăm megabyte và giải mã liên tục suốt buổi học, trong khi ảnh cho cảm giác
 * chuyển động tương đương, sắc nét ở mọi cỡ màn hình và tốn vài megabyte. Người
 * bật "giảm chuyển động" trong hệ điều hành thì nền đứng yên hẳn.
 */
export function Scenery({
  scenes,
  dir,
  overlay = 'medium',
}: {
  scenes: Scene[];
  /** Thư mục ảnh trong `public/`, ví dụ `scenery-vn`. */
  dir: string;
  /** Chỉnh độ dày của lớp phủ quanh giá trị mặc định của giao diện. */
  overlay?: 'light' | 'medium' | 'strong';
}) {
  const [index, setIndex] = useState(0);
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotion(!query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!motion || scenes.length < 2) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % scenes.length), SCENE_MS);
    return () => clearInterval(timer);
  }, [motion, scenes.length]);

  const active = scenes[index] ?? scenes[0];
  if (!active) return null;

  // Lớp phủ lấy từ biến theo giao diện: sáng thì veil sáng, tối thì veil tối.
  // Chữ ở giao diện sáng là chữ đen, dìm ảnh tối lại là tụt tương phản.
  const scrim = 'var(--scenery-scrim)';

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {scenes.map((scene, sceneIndex) => (
        <div
          key={scene.slug}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-[2500ms] ease-in-out"
          style={{
            backgroundImage: `url(${publicAssetUrl(`/${dir}/${scene.slug}.jpg`)})`,
            // Ảnh phong cảnh hay hơi trầm; nhấc sáng và bão hoà lên một chút.
            filter: 'brightness(1.18) saturate(1.12) contrast(1.03)',
            opacity: sceneIndex === index ? 1 : 0,
            animation:
              motion && sceneIndex === index
                ? `scenery-drift ${SCENE_MS + 3000}ms ease-out forwards`
                : undefined,
          }}
        />
      ))}

      <div
        className="absolute inset-0"
        style={{
          background: scrim,
          opacity: overlay === 'light' ? 0.6 : overlay === 'strong' ? 1 : 1,
        }}
      />

      <p className="absolute bottom-2 right-3 text-[10px] leading-tight text-[var(--text-subtle)] opacity-80">
        {active.nameVi} · {active.placeVi} — ảnh {active.credit}, {active.license}
      </p>

      <style>{`
        @keyframes scenery-drift {
          from { transform: scale(1.04) translate3d(0, 0, 0); }
          to   { transform: scale(1.16) translate3d(-1.5%, -1%, 0); }
        }
      `}</style>
    </div>
  );
}
