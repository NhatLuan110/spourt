import type { HskLevel } from '@sprout/shared';

/**
 * Bài đọc chia theo cấp HSK, kèm câu hỏi hiểu bài. Xem D-108 trong DECISIONS.md
 * về lý do nội dung tĩnh này nằm ở frontend.
 *
 * Mỗi bài chỉ dùng từ trong phạm vi cấp của nó hoặc thấp hơn, nên người học
 * xong HSK 1 đọc được ngay bài HSK 1 mà không phải tra quá ba, bốn từ.
 */
export interface ReadingQuestion {
  question: string;
  options: string[];
  /** Chỉ số đáp án đúng trong `options`. */
  answer: number;
  explain: string;
}

export interface ReadingPassage {
  slug: string;
  hsk: HskLevel;
  title: string;
  titleVi: string;
  /** Từng câu một, để hiển thị kèm pinyin và bản dịch theo dòng. */
  lines: { cn: string; pinyin: string; vi: string }[];
  questions: ReadingQuestion[];
}

export const CHINESE_READING: ReadingPassage[] = [
  {
    slug: 'my-family',
    hsk: 'HSK1',
    title: '我的家',
    titleVi: 'Gia đình tôi',
    lines: [
      { cn: '我叫小明。', pinyin: 'Wǒ jiào Xiǎo Míng.', vi: 'Tôi tên là Tiểu Minh.' },
      { cn: '我家有四个人。', pinyin: 'Wǒ jiā yǒu sì ge rén.', vi: 'Nhà tôi có bốn người.' },
      { cn: '爸爸是老师，妈妈是医生。', pinyin: 'Bàba shì lǎoshī, māma shì yīshēng.', vi: 'Bố là giáo viên, mẹ là bác sĩ.' },
      { cn: '我有一个妹妹。', pinyin: 'Wǒ yǒu yí ge mèimei.', vi: 'Tôi có một em gái.' },
      { cn: '她今年八岁。', pinyin: 'Tā jīnnián bā suì.', vi: 'Năm nay em ấy tám tuổi.' },
      { cn: '我们都很喜欢小狗。', pinyin: 'Wǒmen dōu hěn xǐhuan xiǎo gǒu.', vi: 'Cả nhà tôi đều thích chó con.' },
    ],
    questions: [
      {
        question: '小明家有几个人？',
        options: ['三个', '四个', '五个', '两个'],
        answer: 1,
        explain: 'Câu thứ hai nói rõ 我家有四个人 — nhà có bốn người.',
      },
      {
        question: '妈妈做什么工作？',
        options: ['老师', '医生', '学生', '警察'],
        answer: 1,
        explain: '妈妈是医生 — mẹ là bác sĩ. Bố mới là giáo viên.',
      },
    ],
  },
  {
    slug: 'my-day',
    hsk: 'HSK1',
    title: '我的一天',
    titleVi: 'Một ngày của tôi',
    lines: [
      { cn: '我每天六点起床。', pinyin: 'Wǒ měitiān liù diǎn qǐchuáng.', vi: 'Mỗi ngày tôi dậy lúc 6 giờ.' },
      { cn: '七点吃早饭。', pinyin: 'Qī diǎn chī zǎofàn.', vi: '7 giờ ăn sáng.' },
      { cn: '八点去学校。', pinyin: 'Bā diǎn qù xuéxiào.', vi: '8 giờ đi học.' },
      { cn: '中午我在学校吃饭。', pinyin: 'Zhōngwǔ wǒ zài xuéxiào chī fàn.', vi: 'Buổi trưa tôi ăn ở trường.' },
      { cn: '下午五点回家。', pinyin: 'Xiàwǔ wǔ diǎn huí jiā.', vi: 'Chiều 5 giờ về nhà.' },
      { cn: '晚上我看书，十点睡觉。', pinyin: 'Wǎnshang wǒ kàn shū, shí diǎn shuìjiào.', vi: 'Tối tôi đọc sách, 10 giờ đi ngủ.' },
    ],
    questions: [
      {
        question: '他几点去学校？',
        options: ['六点', '七点', '八点', '五点'],
        answer: 2,
        explain: '八点去学校 — 8 giờ đi học.',
      },
      {
        question: '他中午在哪儿吃饭？',
        options: ['在家', '在学校', '在饭馆', '在医院'],
        answer: 1,
        explain: '中午我在学校吃饭 — trưa ăn ở trường.',
      },
    ],
  },
  {
    slug: 'weekend',
    hsk: 'HSK2',
    title: '周末做什么',
    titleVi: 'Cuối tuần làm gì',
    lines: [
      { cn: '上个周末我去了朋友家。', pinyin: 'Shàng ge zhōumò wǒ qù le péngyǒu jiā.', vi: 'Cuối tuần trước tôi đến nhà bạn.' },
      { cn: '我们一起做饭，一起看电影。', pinyin: 'Wǒmen yìqǐ zuò fàn, yìqǐ kàn diànyǐng.', vi: 'Chúng tôi cùng nấu ăn, cùng xem phim.' },
      { cn: '他做的菜很好吃。', pinyin: 'Tā zuò de cài hěn hǎochī.', vi: 'Món bạn ấy nấu rất ngon.' },
      { cn: '下午我们去公园走了两个小时。', pinyin: 'Xiàwǔ wǒmen qù gōngyuán zǒu le liǎng ge xiǎoshí.', vi: 'Buổi chiều chúng tôi đi bộ ở công viên hai tiếng.' },
      { cn: '这个周末我想在家休息。', pinyin: 'Zhège zhōumò wǒ xiǎng zài jiā xiūxi.', vi: 'Cuối tuần này tôi muốn nghỉ ở nhà.' },
    ],
    questions: [
      {
        question: '上个周末他去了哪儿？',
        options: ['公司', '朋友家', '学校', '医院'],
        answer: 1,
        explain: '我去了朋友家 — đến nhà bạn.',
      },
      {
        question: '这个周末他想做什么？',
        options: ['去公园', '看电影', '在家休息', '做饭'],
        answer: 2,
        explain: '这个周末我想在家休息 — muốn nghỉ ở nhà.',
      },
    ],
  },
  {
    slug: 'shopping',
    hsk: 'HSK2',
    title: '买东西',
    titleVi: 'Đi mua đồ',
    lines: [
      { cn: '昨天我去商店买东西。', pinyin: 'Zuótiān wǒ qù shāngdiàn mǎi dōngxi.', vi: 'Hôm qua tôi đi cửa hàng mua đồ.' },
      { cn: '我买了两件衣服和一双鞋。', pinyin: 'Wǒ mǎi le liǎng jiàn yīfu hé yì shuāng xié.', vi: 'Tôi mua hai bộ quần áo và một đôi giày.' },
      { cn: '衣服不太贵，鞋有点儿贵。', pinyin: 'Yīfu bú tài guì, xié yǒudiǎnr guì.', vi: 'Quần áo không đắt lắm, giày hơi đắt.' },
      { cn: '一共花了五百块。', pinyin: 'Yígòng huā le wǔbǎi kuài.', vi: 'Tổng cộng hết năm trăm tệ.' },
    ],
    questions: [
      {
        question: '他买了什么？',
        options: ['书和笔', '衣服和鞋', '菜和水果', '手机'],
        answer: 1,
        explain: '两件衣服和一双鞋 — hai bộ quần áo và một đôi giày.',
      },
      {
        question: '什么有点儿贵？',
        options: ['衣服', '鞋', '书', '水果'],
        answer: 1,
        explain: '鞋有点儿贵 — giày hơi đắt.',
      },
    ],
  },
  {
    slug: 'learning-chinese',
    hsk: 'HSK3',
    title: '学习汉语',
    titleVi: 'Học tiếng Trung',
    lines: [
      { cn: '我学汉语已经两年了。', pinyin: 'Wǒ xué Hànyǔ yǐjīng liǎng nián le.', vi: 'Tôi học tiếng Trung được hai năm rồi.' },
      { cn: '刚开始的时候，我觉得汉字很难。', pinyin: 'Gāng kāishǐ de shíhou, wǒ juéde Hànzì hěn nán.', vi: 'Lúc mới bắt đầu tôi thấy chữ Hán rất khó.' },
      { cn: '后来我每天写十个字。', pinyin: 'Hòulái wǒ měitiān xiě shí ge zì.', vi: 'Sau đó mỗi ngày tôi viết mười chữ.' },
      { cn: '现在我能看懂简单的文章了。', pinyin: 'Xiànzài wǒ néng kàn dǒng jiǎndān de wénzhāng le.', vi: 'Giờ tôi đọc hiểu được bài đơn giản rồi.' },
      { cn: '我觉得学习最重要的是坚持。', pinyin: 'Wǒ juéde xuéxí zuì zhòngyào de shì jiānchí.', vi: 'Tôi thấy học quan trọng nhất là kiên trì.' },
    ],
    questions: [
      {
        question: '他学汉语多长时间了？',
        options: ['一年', '两年', '三年', '半年'],
        answer: 1,
        explain: '学汉语已经两年了 — được hai năm.',
      },
      {
        question: '他觉得学习最重要的是什么？',
        options: ['老师', '书', '坚持', '时间'],
        answer: 2,
        explain: '最重要的是坚持 — quan trọng nhất là kiên trì.',
      },
    ],
  },
  {
    slug: 'city-life',
    hsk: 'HSK4',
    title: '城市生活',
    titleVi: 'Cuộc sống thành phố',
    lines: [
      {
        cn: '越来越多的年轻人选择在大城市工作。',
        pinyin: 'Yuè lái yuè duō de niánqīngrén xuǎnzé zài dà chéngshì gōngzuò.',
        vi: 'Ngày càng nhiều người trẻ chọn làm việc ở thành phố lớn.',
      },
      {
        cn: '虽然大城市的机会比较多，但是压力也很大。',
        pinyin: 'Suīrán dà chéngshì de jīhuì bǐjiào duō, dànshì yālì yě hěn dà.',
        vi: 'Tuy thành phố lớn nhiều cơ hội hơn nhưng áp lực cũng lớn.',
      },
      {
        cn: '房租贵，交通也很挤。',
        pinyin: 'Fángzū guì, jiāotōng yě hěn jǐ.',
        vi: 'Tiền thuê nhà đắt, giao thông cũng đông đúc.',
      },
      {
        cn: '因为这个原因，有些人决定回老家发展。',
        pinyin: 'Yīnwèi zhège yuányīn, yǒuxiē rén juédìng huí lǎojiā fāzhǎn.',
        vi: 'Vì lý do đó, một số người quyết định về quê phát triển.',
      },
    ],
    questions: [
      {
        question: '大城市有什么问题？',
        options: ['机会少', '房租贵、交通挤', '没有工作', '天气不好'],
        answer: 1,
        explain: '房租贵，交通也很挤 — thuê nhà đắt, giao thông đông.',
      },
      {
        question: '有些人为什么回老家？',
        options: ['想家', '因为城市压力大', '找不到工作', '不喜欢城市'],
        answer: 1,
        explain: 'Bài nêu áp lực lớn, thuê nhà đắt là nguyên nhân.',
      },
    ],
  },
];

export const READING_BY_LEVEL = (level: HskLevel): ReadingPassage[] =>
  CHINESE_READING.filter((passage) => passage.hsk === level);
