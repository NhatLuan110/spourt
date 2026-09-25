import type { HskLevel } from '@sprout/shared';

/**
 * Điểm ngữ pháp tiếng Trung, soạn cho người Việt.
 *
 * D-108 — nội dung tham khảo tĩnh này nằm ngay trong frontend chứ không đi qua
 * YAML rồi cơ sở dữ liệu như kho tiếng Anh: nó không có trạng thái theo người
 * học, không cần truy vấn, không cần phân trang. Bài tập thì sinh tại chỗ từ
 * chính các ví dụ, nên thêm một bảng nữa chỉ tốn vòng đi về mà không được gì.
 * Khi nào cần chấm điểm và lưu tiến độ từng bài thì mới chuyển xuống DB.
 */
export interface GrammarExample {
  cn: string;
  pinyin: string;
  vi: string;
}

export interface GrammarPoint {
  slug: string;
  hsk: HskLevel;
  title: string;
  /** Công thức, viết như người Việt hay ghi trong vở. */
  formula: string;
  explain: string;
  /** Lỗi người Việt hay mắc ở đúng điểm này. */
  pitfall: string;
  examples: GrammarExample[];
}

export const CHINESE_GRAMMAR: GrammarPoint[] = [
  {
    slug: 'shi',
    hsk: 'HSK1',
    title: 'Câu với 是 — "là"',
    formula: 'A + 是 + B',
    explain:
      '是 nối hai danh từ, tương đương "là" tiếng Việt. Không dùng 是 trước tính từ — đó là lỗi phổ biến nhất của người mới.',
    pitfall: 'Nói 我是高 là sai. Tính từ dùng 很: 我很高.',
    examples: [
      { cn: '我是学生。', pinyin: 'Wǒ shì xuéshēng.', vi: 'Tôi là học sinh.' },
      { cn: '他是我的朋友。', pinyin: 'Tā shì wǒ de péngyǒu.', vi: 'Anh ấy là bạn tôi.' },
      { cn: '这不是我的书。', pinyin: 'Zhè bú shì wǒ de shū.', vi: 'Đây không phải sách của tôi.' },
    ],
  },
  {
    slug: 'hen-adj',
    hsk: 'HSK1',
    title: 'Tính từ làm vị ngữ với 很',
    formula: 'Chủ ngữ + 很 + tính từ',
    explain:
      'Tiếng Trung không cần động từ "là" trước tính từ. 很 ở đây thường chỉ là chỗ đệm, không hẳn mang nghĩa "rất".',
    pitfall: 'Bỏ 很 đi thì câu mang ý so sánh ngầm: 我好 nghe như "tôi khá hơn (ai đó)".',
    examples: [
      { cn: '今天很热。', pinyin: 'Jīntiān hěn rè.', vi: 'Hôm nay nóng.' },
      { cn: '这个菜很好吃。', pinyin: 'Zhège cài hěn hǎochī.', vi: 'Món này ngon.' },
      { cn: '我不忙。', pinyin: 'Wǒ bù máng.', vi: 'Tôi không bận.' },
    ],
  },
  {
    slug: 'ma-question',
    hsk: 'HSK1',
    title: 'Câu hỏi với 吗',
    formula: 'Câu khẳng định + 吗？',
    explain: 'Thêm 吗 vào cuối câu trần thuật là thành câu hỏi có/không. Trật tự từ giữ nguyên.',
    pitfall: 'Đã có từ để hỏi (什么, 谁, 哪儿) thì không thêm 吗 nữa.',
    examples: [
      { cn: '你是老师吗？', pinyin: 'Nǐ shì lǎoshī ma?', vi: 'Bạn là giáo viên à?' },
      { cn: '你忙吗？', pinyin: 'Nǐ máng ma?', vi: 'Bạn có bận không?' },
      { cn: '他来吗？', pinyin: 'Tā lái ma?', vi: 'Anh ấy có đến không?' },
    ],
  },
  {
    slug: 'measure-words',
    hsk: 'HSK1',
    title: 'Lượng từ',
    formula: 'Số từ + lượng từ + danh từ',
    explain:
      'Giữa số và danh từ bắt buộc có lượng từ, giống "một con mèo", "hai quyển sách" trong tiếng Việt. 个 là lượng từ dùng chung khi chưa nhớ từ đúng.',
    pitfall: 'Nói 三书 là sai, phải là 三本书.',
    examples: [
      { cn: '三本书', pinyin: 'sān běn shū', vi: 'ba quyển sách' },
      { cn: '两个人', pinyin: 'liǎng ge rén', vi: 'hai người' },
      { cn: '一杯水', pinyin: 'yì bēi shuǐ', vi: 'một cốc nước' },
    ],
  },
  {
    slug: 'de-possessive',
    hsk: 'HSK1',
    title: 'Trợ từ 的',
    formula: 'Người/vật sở hữu + 的 + danh từ',
    explain: '的 nối phần bổ nghĩa với danh từ đứng sau, tương đương "của" hoặc mệnh đề quan hệ.',
    pitfall: 'Quan hệ thân thiết thường lược 的: 我妈妈 chứ ít khi nói 我的妈妈.',
    examples: [
      { cn: '我的手机', pinyin: 'wǒ de shǒujī', vi: 'điện thoại của tôi' },
      { cn: '老师的书', pinyin: 'lǎoshī de shū', vi: 'sách của thầy giáo' },
      { cn: '很好看的电影', pinyin: 'hěn hǎokàn de diànyǐng', vi: 'bộ phim rất hay' },
    ],
  },
  {
    slug: 'word-order',
    hsk: 'HSK1',
    title: 'Trật tự cơ bản: Thời gian — Nơi chốn — Cách thức — Động từ',
    formula: 'Chủ ngữ + thời gian + nơi chốn + động từ + tân ngữ',
    explain:
      'Khác tiếng Việt, trạng ngữ thời gian và nơi chốn đứng TRƯỚC động từ chứ không đứng sau.',
    pitfall: '我吃饭在家 là sai. Phải nói 我在家吃饭.',
    examples: [
      { cn: '我明天在家看书。', pinyin: 'Wǒ míngtiān zài jiā kàn shū.', vi: 'Mai tôi đọc sách ở nhà.' },
      { cn: '他每天六点起床。', pinyin: 'Tā měitiān liù diǎn qǐchuáng.', vi: 'Anh ấy dậy lúc 6 giờ mỗi ngày.' },
    ],
  },
  {
    slug: 'le-completion',
    hsk: 'HSK2',
    title: '了 chỉ việc đã xảy ra',
    formula: 'Động từ + 了 + tân ngữ',
    explain:
      '了 đánh dấu hành động đã hoàn tất, không phải thì quá khứ. Câu tương lai vẫn dùng được 了.',
    pitfall: 'Thói quen, việc lặp lại thì không dùng 了: 我每天喝咖啡, không phải 喝了.',
    examples: [
      { cn: '我吃了饭。', pinyin: 'Wǒ chī le fàn.', vi: 'Tôi ăn cơm rồi.' },
      { cn: '他买了三本书。', pinyin: 'Tā mǎi le sān běn shū.', vi: 'Anh ấy mua ba quyển sách.' },
      { cn: '下班了我就回家。', pinyin: 'Xiàbān le wǒ jiù huí jiā.', vi: 'Tan làm là tôi về nhà.' },
    ],
  },
  {
    slug: 'zai-progressive',
    hsk: 'HSK2',
    title: '在 + động từ — đang làm',
    formula: 'Chủ ngữ + 在 + động từ',
    explain: 'Diễn tả hành động đang diễn ra, tương đương "đang" tiếng Việt. Có thể thêm 正 hoặc 呢.',
    pitfall: 'Đừng lẫn với 在 chỉ nơi chốn: 我在家 là "tôi ở nhà", 我在吃饭 là "tôi đang ăn".',
    examples: [
      { cn: '我在看电视。', pinyin: 'Wǒ zài kàn diànshì.', vi: 'Tôi đang xem TV.' },
      { cn: '他正在打电话呢。', pinyin: 'Tā zhèngzài dǎ diànhuà ne.', vi: 'Anh ấy đang gọi điện.' },
    ],
  },
  {
    slug: 'guo-experience',
    hsk: 'HSK2',
    title: '过 — đã từng',
    formula: 'Động từ + 过',
    explain: 'Diễn tả kinh nghiệm từng trải qua ít nhất một lần, không quan tâm lúc nào.',
    pitfall: 'Phủ định dùng 没 và GIỮ 过: 我没去过中国.',
    examples: [
      { cn: '我去过北京。', pinyin: 'Wǒ qù guo Běijīng.', vi: 'Tôi từng đến Bắc Kinh.' },
      { cn: '你吃过火锅吗？', pinyin: 'Nǐ chī guo huǒguō ma?', vi: 'Bạn ăn lẩu bao giờ chưa?' },
    ],
  },
  {
    slug: 'bi-comparison',
    hsk: 'HSK2',
    title: 'So sánh với 比',
    formula: 'A + 比 + B + tính từ',
    explain: 'Cấu trúc so sánh hơn. Mức độ đặt SAU tính từ, không đặt trước.',
    pitfall: 'Không dùng 很 trong câu 比. 他比我很高 là sai; nói 他比我高一点.',
    examples: [
      { cn: '他比我高。', pinyin: 'Tā bǐ wǒ gāo.', vi: 'Anh ấy cao hơn tôi.' },
      { cn: '今天比昨天冷一点。', pinyin: 'Jīntiān bǐ zuótiān lěng yìdiǎn.', vi: 'Hôm nay lạnh hơn hôm qua một chút.' },
    ],
  },
  {
    slug: 'yao-xiang-neng',
    hsk: 'HSK2',
    title: '想 / 要 / 能 / 会 — nhóm động từ năng nguyện',
    formula: 'Chủ ngữ + 想/要/能/会 + động từ',
    explain:
      '想 là muốn (thiên về mong muốn), 要 là định làm (dứt khoát hơn), 能 là có điều kiện làm được, 会 là biết làm nhờ đã học.',
    pitfall: 'Bơi được vì đã học thì dùng 会游泳; hôm nay đủ sức bơi thì dùng 能游泳.',
    examples: [
      { cn: '我想喝咖啡。', pinyin: 'Wǒ xiǎng hē kāfēi.', vi: 'Tôi muốn uống cà phê.' },
      { cn: '我会说中文。', pinyin: 'Wǒ huì shuō Zhōngwén.', vi: 'Tôi biết nói tiếng Trung.' },
      { cn: '今天我不能去。', pinyin: 'Jīntiān wǒ bù néng qù.', vi: 'Hôm nay tôi không đi được.' },
    ],
  },
  {
    slug: 'ba-construction',
    hsk: 'HSK3',
    title: 'Câu chữ 把',
    formula: 'Chủ ngữ + 把 + tân ngữ + động từ + thành phần kết quả',
    explain:
      'Đưa tân ngữ lên trước động từ để nhấn vào việc xử lý nó ra sao. Sau động từ bắt buộc có thành phần chỉ kết quả.',
    pitfall: 'Không được để động từ trơ trọi: 我把书看 là sai, phải 我把书看完了.',
    examples: [
      { cn: '我把作业做完了。', pinyin: 'Wǒ bǎ zuòyè zuò wán le.', vi: 'Tôi làm xong bài tập rồi.' },
      { cn: '请把门关上。', pinyin: 'Qǐng bǎ mén guān shàng.', vi: 'Làm ơn đóng cửa lại.' },
    ],
  },
  {
    slug: 'de-complement',
    hsk: 'HSK3',
    title: 'Bổ ngữ trình độ với 得',
    formula: 'Động từ + 得 + tính từ',
    explain: 'Nhận xét hành động làm tốt hay dở tới đâu.',
    pitfall: 'Có tân ngữ thì phải lặp động từ: 他说中文说得很好.',
    examples: [
      { cn: '他跑得很快。', pinyin: 'Tā pǎo de hěn kuài.', vi: 'Anh ấy chạy nhanh.' },
      { cn: '你写得不错。', pinyin: 'Nǐ xiě de búcuò.', vi: 'Bạn viết khá đấy.' },
    ],
  },
  {
    slug: 'result-complement',
    hsk: 'HSK3',
    title: 'Bổ ngữ kết quả',
    formula: 'Động từ + 完/好/到/见/懂',
    explain: 'Gắn ngay sau động từ để nói hành động dẫn tới kết quả gì.',
    pitfall: 'Phủ định dùng 没 chứ không dùng 不: 我没听懂.',
    examples: [
      { cn: '我听懂了。', pinyin: 'Wǒ tīng dǒng le.', vi: 'Tôi nghe hiểu rồi.' },
      { cn: '你看见他了吗？', pinyin: 'Nǐ kànjiàn tā le ma?', vi: 'Bạn có thấy anh ấy không?' },
    ],
  },
  {
    slug: 'yinwei-suoyi',
    hsk: 'HSK3',
    title: '因为… 所以… — vì… nên…',
    formula: '因为 + nguyên nhân, 所以 + kết quả',
    explain: 'Tiếng Trung giữ cả hai vế, khác tiếng Anh chỉ dùng một.',
    pitfall: 'Không bỏ 所以 như thói quen dịch từ tiếng Anh.',
    examples: [
      {
        cn: '因为下雨，所以我没去。',
        pinyin: 'Yīnwèi xià yǔ, suǒyǐ wǒ méi qù.',
        vi: 'Vì trời mưa nên tôi không đi.',
      },
    ],
  },
  {
    slug: 'suiran-danshi',
    hsk: 'HSK3',
    title: '虽然… 但是… — tuy… nhưng…',
    formula: '虽然 + vế nhượng bộ, 但是 + vế chính',
    explain: 'Cặp liên từ đi đôi, giữ cả hai vế.',
    pitfall: 'Giống cặp 因为…所以…, không được lược vế sau.',
    examples: [
      {
        cn: '虽然很累，但是我很开心。',
        pinyin: 'Suīrán hěn lèi, dànshì wǒ hěn kāixīn.',
        vi: 'Tuy mệt nhưng tôi rất vui.',
      },
    ],
  },
  {
    slug: 'bei-passive',
    hsk: 'HSK4',
    title: 'Câu bị động với 被',
    formula: 'Người/vật chịu tác động + 被 + tác nhân + động từ + kết quả',
    explain: 'Diễn tả bị động, thường dùng cho việc không mong muốn.',
    pitfall: 'Tiếng Trung ít dùng bị động hơn tiếng Việt; việc trung tính thường nói chủ động.',
    examples: [
      { cn: '我的手机被偷了。', pinyin: 'Wǒ de shǒujī bèi tōu le.', vi: 'Điện thoại tôi bị trộm mất.' },
      { cn: '杯子被他打破了。', pinyin: 'Bēizi bèi tā dǎ pò le.', vi: 'Cái cốc bị anh ấy làm vỡ.' },
    ],
  },
  {
    slug: 'jiu-cai',
    hsk: 'HSK4',
    title: '就 và 才 — sớm hay muộn',
    formula: 'Thời gian + 就/才 + động từ',
    explain: '就 hàm ý sớm hơn mong đợi, 才 hàm ý muộn hơn hoặc khó khăn hơn mong đợi.',
    pitfall: 'Hai từ này mang thái độ người nói, không chỉ là thời gian khách quan.',
    examples: [
      { cn: '他六点就来了。', pinyin: 'Tā liù diǎn jiù lái le.', vi: 'Mới 6 giờ anh ấy đã đến.' },
      { cn: '他十点才来。', pinyin: 'Tā shí diǎn cái lái.', vi: 'Mãi 10 giờ anh ấy mới đến.' },
    ],
  },
  {
    slug: 'yuelaiyue',
    hsk: 'HSK4',
    title: '越来越 — ngày càng',
    formula: '越来越 + tính từ',
    explain: 'Diễn tả mức độ tăng dần theo thời gian.',
    pitfall: 'Không thêm 很: 越来越很冷 là sai.',
    examples: [
      { cn: '天气越来越冷了。', pinyin: 'Tiānqì yuè lái yuè lěng le.', vi: 'Trời ngày càng lạnh.' },
      {
        cn: '我的中文越来越好。',
        pinyin: 'Wǒ de Zhōngwén yuè lái yuè hǎo.',
        vi: 'Tiếng Trung của tôi ngày càng khá.',
      },
    ],
  },
  {
    slug: 'chule',
    hsk: 'HSK4',
    title: '除了… 以外 — ngoài… ra',
    formula: '除了 A 以外, 都/也 + …',
    explain: 'Đi với 都 nghĩa là loại trừ A; đi với 也 nghĩa là gồm cả A.',
    pitfall: 'Chọn nhầm 都 hay 也 là đảo ngược hẳn nghĩa câu.',
    examples: [
      {
        cn: '除了他以外，我们都去了。',
        pinyin: 'Chúle tā yǐwài, wǒmen dōu qù le.',
        vi: 'Ngoài anh ấy ra, chúng tôi đều đi.',
      },
      {
        cn: '除了汉语，他也会英语。',
        pinyin: 'Chúle Hànyǔ, tā yě huì Yīngyǔ.',
        vi: 'Ngoài tiếng Trung, anh ấy còn biết tiếng Anh.',
      },
    ],
  },
  {
    slug: 'shi-de',
    hsk: 'HSK4',
    title: 'Cấu trúc 是… 的 — nhấn hoàn cảnh',
    formula: '是 + thời gian/nơi chốn/cách thức + động từ + 的',
    explain: 'Việc đã xảy ra rồi, người nói muốn hỏi hoặc nhấn vào lúc nào, ở đâu, bằng cách nào.',
    pitfall: 'Không dùng 了 trong cấu trúc này.',
    examples: [
      { cn: '我是坐飞机来的。', pinyin: 'Wǒ shì zuò fēijī lái de.', vi: 'Tôi đến bằng máy bay.' },
      { cn: '你是什么时候来的？', pinyin: 'Nǐ shì shénme shíhou lái de?', vi: 'Bạn đến lúc nào vậy?' },
    ],
  },
  {
    slug: 'buguan',
    hsk: 'HSK5',
    title: '不管… 都… — bất kể… đều…',
    formula: '不管 + từ để hỏi/A还是B, 都 + …',
    explain: 'Nêu điều kiện nào cũng không đổi kết quả.',
    pitfall: 'Vế sau bắt buộc có 都 hoặc 也.',
    examples: [
      {
        cn: '不管多难，我都要试试。',
        pinyin: 'Bùguǎn duō nán, wǒ dōu yào shìshi.',
        vi: 'Dù khó thế nào tôi cũng thử.',
      },
    ],
  },
  {
    slug: 'ningke',
    hsk: 'HSK5',
    title: '宁可… 也不… — thà… chứ không…',
    formula: '宁可 A 也不 B',
    explain: 'Chọn phương án A dù không dễ chịu, để tránh B.',
    pitfall: 'Trật tự cố định, đảo lại là sai nghĩa.',
    examples: [
      {
        cn: '我宁可走路也不坐车。',
        pinyin: 'Wǒ nìngkě zǒulù yě bù zuò chē.',
        vi: 'Tôi thà đi bộ chứ không đi xe.',
      },
    ],
  },
  {
    slug: 'jiran',
    hsk: 'HSK5',
    title: '既然… 就… — đã… thì…',
    formula: '既然 + sự thật đã biết, 就 + kết luận',
    explain: 'Dựa trên điều cả hai bên đều biết để rút ra kết luận.',
    pitfall: 'Khác 因为 ở chỗ 既然 nêu điều đã rõ, không nêu nguyên nhân mới.',
    examples: [
      {
        cn: '既然你不舒服，就早点休息吧。',
        pinyin: 'Jìrán nǐ bù shūfu, jiù zǎodiǎn xiūxi ba.',
        vi: 'Đã không khoẻ thì nghỉ sớm đi.',
      },
    ],
  },
  {
    slug: 'yiyu',
    hsk: 'HSK6',
    title: '以… 为… — lấy… làm…',
    formula: '以 A 为 B',
    explain: 'Lối viết trang trọng, hay gặp trong văn viết và báo chí.',
    pitfall: 'Không dùng trong hội thoại đời thường, nghe rất cứng.',
    examples: [
      {
        cn: '我们以质量为第一。',
        pinyin: 'Wǒmen yǐ zhìliàng wéi dì yī.',
        vi: 'Chúng tôi lấy chất lượng làm đầu.',
      },
    ],
  },
  {
    slug: 'zhisuoyi',
    hsk: 'HSK6',
    title: '之所以… 是因为… — sở dĩ… là vì…',
    formula: '之所以 + kết quả, 是因为 + nguyên nhân',
    explain: 'Đảo ngược 因为…所以…: nêu kết quả trước để nhấn mạnh, rồi mới giải thích.',
    pitfall: 'Dùng cho văn viết hoặc lập luận, không dùng khi nói chuyện thường.',
    examples: [
      {
        cn: '他之所以成功，是因为他很努力。',
        pinyin: 'Tā zhī suǒyǐ chénggōng, shì yīnwèi tā hěn nǔlì.',
        vi: 'Sở dĩ anh ấy thành công là vì anh ấy rất chăm.',
      },
    ],
  },
];

export const GRAMMAR_BY_LEVEL = (level: HskLevel): GrammarPoint[] =>
  CHINESE_GRAMMAR.filter((point) => point.hsk === level);
