import { CHINA_SCENES, VIETNAM_SCENES } from './scenery';
import type { Scene } from './scenery';

/**
 * Mỗi mục điều hướng gắn với một danh thắng riêng, nên chuyển mục là đổi cảnh
 * nền. Nhờ vậy người học nhận ra mình đang ở đâu bằng cả hình ảnh chứ không chỉ
 * bằng mục đang sáng trên sidebar.
 *
 * Ngăn tiếng Anh dùng cảnh Việt Nam, ngăn tiếng Trung dùng cảnh Trung Quốc.
 */
const VN_BY_ROUTE: Record<string, string> = {
  '/dashboard': 'ha-long',
  '/vocabulary': 'hoi-an',
  '/word-class': 'my-son',
  '/listening': 'phong-nha',
  '/speaking': 'golden-bridge',
  '/writing': 'hue',
  '/grammar': 'trang-an',
  '/reading': 'hoan-kiem',
  '/sentence': 'mekong',
  '/tutor': 'da-lat',
  '/tests': 'ban-gioc',
  '/analytics': 'hcmc',
  '/settings': 'nha-trang',
  '/decks': 'phu-quoc',
  '/review': 'sapa',
  '/practice': 'sapa',
  '/flashcards': 'mui-ne',
  '/learn': 'mui-ne',
  '/word': 'hoi-an',
  '/collection': 'phu-quoc',
  '/admin': 'hcmc',
  '/welcome': 'ha-long',
};

const CN_BY_ROUTE: Record<string, string> = {
  '/chinese': 'li-river',
  '/chinese/pinyin': 'huangshan',
  '/chinese/vocabulary': 'hongcun',
  '/chinese/listening': 'jiuzhaigou',
  '/chinese/speaking': 'shanghai',
  '/chinese/writing': 'forbidden-city',
  '/chinese/grammar': 'temple-heaven',
  '/chinese/reading': 'summer-palace',
  '/chinese/sentence': 'longji',
  '/chinese/radicals': 'terracotta',
  '/chinese/tutor': 'west-lake',
  '/chinese/tests': 'leshan',
  '/chinese/analytics': 'danxia',
  '/chinese/hanzi': 'zhangjiajie',
  '/chinese/hsk': 'great-wall',
  '/chinese/learn': 'potala',
  '/chinese/review': 'great-wall',
};

export interface SceneryChoice {
  scenes: Scene[];
  dir: string;
}

function pick(scenes: Scene[], slug: string | undefined, fallback: Scene[]): Scene[] {
  const found = slug ? scenes.find((scene) => scene.slug === slug) : undefined;
  return found ? [found] : fallback;
}

/**
 * Cảnh cho một đường dẫn. Khớp tiền tố dài nhất trước, nên `/chinese/hsk/HSK1`
 * lấy cảnh của `/chinese/hsk`, còn đường dẫn lạ thì quay về cảnh trang chủ ngăn.
 */
export function sceneryForPath(pathname: string): SceneryChoice {
  const chinese = pathname === '/chinese' || pathname.startsWith('/chinese/');
  const table = chinese ? CN_BY_ROUTE : VN_BY_ROUTE;
  const scenes = chinese ? CHINA_SCENES : VIETNAM_SCENES;
  const dir = chinese ? 'scenery' : 'scenery-vn';

  const match = Object.keys(table)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];

  return { scenes: pick(scenes, match ? table[match] : undefined, scenes), dir };
}
