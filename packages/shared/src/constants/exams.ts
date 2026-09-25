import type { ExamDefinition, ExamLevelId } from '../schemas/exam-prep.js';

/** Targets describe the learner's goal; practice results are not official scores. */
export const EXAM_DEFINITIONS: ExamDefinition[] = [
  {
    id: 'ielts', name: 'IELTS', variant: 'Academic',
    descriptionVi: 'Từ vựng học thuật, đọc, nghe, Academic Writing và Speaking.',
    scoreNoteVi: 'IELTS dùng thang band 0–9. Mức luyện tăng thử thách về suy luận, diễn đạt và thời gian; kết quả bài luyện không quy đổi thành band thi.',
    sourceUrl: 'https://ielts.org/take-a-test/test-types/ielts-academic-test',
    levels: ['5.0', '6.0', '7.0', '8.0'].map((target, index) => ({
      id: String(index + 1) as ExamLevelId,
      label: `Band ${target}`,
      targetLabel: `Mục tiêu IELTS ${target}`,
      stretchLabel: `Hướng luyện vượt mục tiêu khoảng 0.5 band`,
      descriptionVi: [
        'Đoạn văn dài hơn, câu trả lời cần phân biệt chi tiết và cách diễn đạt lại.',
        'Tăng suy luận, câu phức và yêu cầu giải thích lập trường rõ ràng.',
        'Lập luận nhiều lớp, thông tin được giới hạn và từ vựng học thuật chính xác.',
        'Sắc thái tinh tế, bằng chứng gián tiếp và lập luận chặt chẽ dưới áp lực thời gian.',
      ][index]!,
    })),
  },
  {
    id: 'toeic', name: 'TOEIC', variant: 'Listening & Reading + Speaking & Writing',
    descriptionVi: 'Tình huống công việc, đọc và nghe, cùng bài viết và nói của bài thi riêng.',
    scoreNoteVi: 'Listening & Reading: 10–990 điểm tổng. Speaking và Writing: 0–200 điểm cho từng kỹ năng. Các mục tiêu dưới đây được chọn riêng, không phải bảng quy đổi.',
    sourceUrl: 'https://www.ets.org/toeic/about.html',
    levels: [450, 650, 800, 900].map((target, index) => ({
      id: String(index + 1) as ExamLevelId,
      label: `${target} L&R`,
      targetLabel: `Mục tiêu L&R ${target}`,
      speakingWritingTargetLabel: `Mục tiêu Nói ${[80, 120, 160, 180][index]} · Viết ${[80, 120, 160, 180][index]}`,
      stretchLabel: 'Luyện vượt mục tiêu: tăng mật độ thông tin và suy luận',
      descriptionVi: [
        'Lịch hẹn, giao hàng và thông báo có thay đổi cần theo dõi.',
        'Đối chiếu nhiều tài liệu và trình bày lý do trong email công việc.',
        'Ràng buộc ngân sách, đàm phán và suy ra hành động tiếp theo.',
        'Điều khoản ngoại lệ, hàm ý và quyết định trong tình huống nhiều điều kiện.',
      ][index]!,
    })),
  },
  {
    id: 'aptis', name: 'Aptis', variant: 'ESOL General',
    descriptionVi: 'Từ vựng và bốn kỹ năng theo tình huống xã hội, câu lạc bộ và cộng đồng.',
    scoreNoteVi: 'Aptis báo trình độ CEFR cùng điểm từng kỹ năng. Mốc A2–C1 là mục tiêu trình độ; bài luyện không dự đoán điểm Aptis.',
    sourceUrl: 'https://www.britishcouncil.org/exam/english/aptis/prepare-general',
    levels: ['A2', 'B1', 'B2', 'C1'].map((target, index) => ({
      id: String(index + 1) as ExamLevelId,
      label: target,
      targetLabel: `Mục tiêu CEFR ${target}`,
      stretchLabel: index === 3 ? 'Luyện C1 với sắc thái và lập luận phức tạp hơn' : `Tăng độ phức tạp hướng tới ${['B1', 'B2', 'C1'][index]}`,
      descriptionVi: [
        'Kết nối thông tin và giải thích lựa chọn thay vì chỉ nhận ra từ khóa.',
        'Trình bày trải nghiệm, so sánh lựa chọn và giải thích thay đổi.',
        'Phân biệt quan điểm, phản biện và điều chỉnh văn phong theo người nhận.',
        'Đánh giá các ưu tiên xung đột và diễn đạt quan điểm có điều kiện.',
      ][index]!,
    })),
  },
];
