export interface AchievementSeed {
  slug: string;
  name: string;
  nameVi: string;
  description: string;
  descriptionVi: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'legendary';
  condition: Record<string, unknown>;
  xpReward: number;
  coinReward: number;
  isSecret?: boolean;
  order: number;
}

/**
 * §12.3 — 34 achievements, named after the nature theme. `condition` is read by
 * the achievement engine, so adding one never needs new code.
 */
export const ACHIEVEMENTS: AchievementSeed[] = [
  // Khởi đầu
  { slug: 'sow-seed', name: 'Sow the seed', nameVi: 'Gieo hạt', description: 'Finish your first lesson', descriptionVi: 'Hoàn thành bài học đầu tiên', icon: '🌰', tier: 'bronze', condition: { type: 'lessons_completed', value: 1 }, xpReward: 20, coinReward: 5, order: 1 },
  { slug: 'first-sprout', name: 'First sprout', nameVi: 'Nảy mầm', description: 'Learn 10 words', descriptionVi: 'Học 10 từ đầu tiên', icon: '🌱', tier: 'bronze', condition: { type: 'words_learned', value: 10 }, xpReward: 30, coinReward: 5, order: 2 },
  { slug: 'taking-root', name: 'Taking root', nameVi: 'Bén rễ', description: 'Learn 50 words', descriptionVi: 'Học 50 từ', icon: '🪴', tier: 'bronze', condition: { type: 'words_learned', value: 50 }, xpReward: 60, coinReward: 10, order: 3 },
  { slug: 'first-review', name: 'Back for more', nameVi: 'Quay lại ôn', description: 'Complete your first review session', descriptionVi: 'Hoàn thành phiên ôn tập đầu tiên', icon: '🔁', tier: 'bronze', condition: { type: 'review_sessions', value: 1 }, xpReward: 20, coinReward: 5, order: 4 },

  // Streak
  { slug: 'first-week', name: 'First week', nameVi: 'Tuần đầu', description: 'A 7 day streak', descriptionVi: 'Chuỗi 7 ngày học liên tục', icon: '🔥', tier: 'bronze', condition: { type: 'streak', value: 7 }, xpReward: 70, coinReward: 15, order: 5 },
  { slug: 'one-month', name: 'One month', nameVi: 'Một tháng', description: 'A 30 day streak', descriptionVi: 'Chuỗi 30 ngày học liên tục', icon: '🌤️', tier: 'silver', condition: { type: 'streak', value: 30 }, xpReward: 200, coinReward: 40, order: 6 },
  { slug: 'hundred-days', name: 'Hundred days', nameVi: '100 ngày', description: 'A 100 day streak', descriptionVi: 'Chuỗi 100 ngày học liên tục', icon: '☀️', tier: 'gold', condition: { type: 'streak', value: 100 }, xpReward: 500, coinReward: 100, order: 7 },
  { slug: 'one-year', name: 'One year', nameVi: 'Một năm', description: 'A 365 day streak', descriptionVi: 'Chuỗi 365 ngày học liên tục', icon: '🏔️', tier: 'legendary', condition: { type: 'streak', value: 365 }, xpReward: 2000, coinReward: 365, order: 8 },

  // Từ vựng
  { slug: 'hundred-leaves', name: 'A hundred leaves', nameVi: 'Trăm lá', description: 'Learn 100 words', descriptionVi: 'Học 100 từ', icon: '📗', tier: 'silver', condition: { type: 'words_learned', value: 100 }, xpReward: 120, coinReward: 20, order: 9 },
  { slug: 'thousand-leaves', name: 'A thousand leaves', nameVi: 'Ngàn lá', description: 'Learn 1000 words', descriptionVi: 'Học 1000 từ', icon: '📚', tier: 'gold', condition: { type: 'words_learned', value: 1000 }, xpReward: 800, coinReward: 150, order: 10 },
  { slug: 'golden-memory', name: 'Golden memory', nameVi: 'Trí nhớ vàng', description: '50 Easy grades in a row', descriptionVi: '50 thẻ chấm Dễ liên tiếp', icon: '🍃', tier: 'gold', condition: { type: 'easy_streak', value: 50 }, xpReward: 300, coinReward: 60, order: 11 },
  { slug: 'topic-master', name: 'Topic master', nameVi: 'Thạo một chủ đề', description: 'Master every word in one topic', descriptionVi: 'Thuộc toàn bộ từ của một chủ đề', icon: '🌻', tier: 'gold', condition: { type: 'topic_mastered', value: 1 }, xpReward: 400, coinReward: 80, order: 12 },

  // Nghe
  { slug: 'sharp-ears', name: 'Sharp ears', nameVi: 'Đôi tai tinh', description: 'Finish 20 listening lessons', descriptionVi: 'Hoàn thành 20 bài nghe', icon: '🎧', tier: 'silver', condition: { type: 'listening_lessons', value: 20 }, xpReward: 150, coinReward: 30, order: 13 },
  { slug: 'no-subtitles', name: 'No subtitles', nameVi: 'Nghe không phụ đề', description: 'Five dictations at 90% or better', descriptionVi: '5 bài chép chính tả đạt từ 90%', icon: '📻', tier: 'gold', condition: { type: 'dictation_above', value: 90, count: 5 }, xpReward: 300, coinReward: 60, order: 14 },
  { slug: 'slow-listener', name: 'Slow and steady', nameVi: 'Chậm mà chắc', description: 'Finish a lesson at 0.75x speed', descriptionVi: 'Hoàn thành một bài nghe ở tốc độ 0.75x', icon: '🐢', tier: 'bronze', condition: { type: 'listening_slow_speed', value: 1 }, xpReward: 40, coinReward: 10, order: 15 },

  // Nói
  { slug: 'first-words', name: 'Speak up', nameVi: 'Mở lời', description: 'Record your first sentence', descriptionVi: 'Lần đầu tiên ghi âm một câu', icon: '🗣️', tier: 'bronze', condition: { type: 'speaking_attempts', value: 1 }, xpReward: 30, coinReward: 10, order: 16 },
  { slug: 'clear-voice', name: 'Clear voice', nameVi: 'Giọng chuẩn', description: 'Ten sentences scoring 90 or more', descriptionVi: '10 câu đạt từ 90 điểm phát âm', icon: '🎤', tier: 'gold', condition: { type: 'speaking_above', value: 90, count: 10 }, xpReward: 300, coinReward: 60, order: 17 },
  { slug: 'role-player', name: 'The actor', nameVi: 'Diễn viên', description: 'Finish 10 role-play sessions', descriptionVi: 'Hoàn thành 10 phiên role-play', icon: '🎭', tier: 'gold', condition: { type: 'roleplay_sessions', value: 10 }, xpReward: 350, coinReward: 70, order: 18 },
  { slug: 'th-master', name: 'The th sound', nameVi: 'Chinh phục âm /θ/', description: 'Twenty correct /θ/ sounds in a row', descriptionVi: '20 lần phát âm đúng /θ/ liên tiếp', icon: '👅', tier: 'silver', condition: { type: 'phoneme_streak', phoneme: 'θ', value: 20 }, xpReward: 200, coinReward: 40, order: 19 },

  // Viết
  { slug: 'the-pen', name: 'The pen', nameVi: 'Ngòi bút', description: 'Submit five pieces of writing', descriptionVi: 'Nộp 5 bài viết', icon: '✍️', tier: 'silver', condition: { type: 'writing_submissions', value: 5 }, xpReward: 150, coinReward: 30, order: 20 },
  { slug: 'the-author', name: 'The author', nameVi: 'Nhà văn', description: 'One piece scoring 90 or more', descriptionVi: 'Một bài viết đạt từ 90 điểm', icon: '📜', tier: 'gold', condition: { type: 'writing_above', value: 90, count: 1 }, xpReward: 300, coinReward: 60, order: 21 },
  { slug: 'first-email', name: 'Sent', nameVi: 'Gửi đi', description: 'Write your first English email', descriptionVi: 'Viết email tiếng Anh đầu tiên', icon: '📧', tier: 'bronze', condition: { type: 'writing_kind', kind: 'email', value: 1 }, xpReward: 50, coinReward: 10, order: 22 },

  // Đọc
  { slug: 'first-passage', name: 'First page', nameVi: 'Trang đầu tiên', description: 'Finish your first reading passage', descriptionVi: 'Đọc xong bài đọc đầu tiên', icon: '📄', tier: 'bronze', condition: { type: 'reading_lessons', value: 1 }, xpReward: 30, coinReward: 5, order: 23 },
  { slug: 'bookworm', name: 'Bookworm', nameVi: 'Mọt sách', description: 'Finish 25 reading passages', descriptionVi: 'Đọc xong 25 bài đọc', icon: '🐛', tier: 'silver', condition: { type: 'reading_lessons', value: 25 }, xpReward: 200, coinReward: 40, order: 24 },

  // Ngữ pháp
  { slug: 'firm-roots', name: 'Firm roots', nameVi: 'Vững gốc', description: 'Finish the A1 grammar path', descriptionVi: 'Hoàn thành toàn bộ ngữ pháp A1', icon: '📖', tier: 'silver', condition: { type: 'grammar_level_complete', level: 'A1' }, xpReward: 250, coinReward: 50, order: 25 },
  { slug: 'grammar-master', name: 'Grammar master', nameVi: 'Bậc thầy ngữ pháp', description: 'Finish the B2 grammar path', descriptionVi: 'Hoàn thành toàn bộ ngữ pháp B2', icon: '🏛️', tier: 'legendary', condition: { type: 'grammar_level_complete', level: 'B2' }, xpReward: 1000, coinReward: 200, order: 26 },
  { slug: 'mistake-fixer', name: 'Mistake fixer', nameVi: 'Sửa lỗi', description: 'Resolve 20 logged mistakes', descriptionVi: 'Khắc phục 20 lỗi trong sổ lỗi', icon: '🩹', tier: 'silver', condition: { type: 'mistakes_resolved', value: 20 }, xpReward: 200, coinReward: 40, order: 27 },

  // Tổng hợp
  { slug: 'all-rounder', name: 'All rounder', nameVi: 'Toàn diện', description: 'Practise all six skills in one day', descriptionVi: 'Luyện đủ 6 kỹ năng trong cùng một ngày', icon: '🌈', tier: 'gold', condition: { type: 'all_skills_one_day', value: 1 }, xpReward: 300, coinReward: 60, order: 28 },
  { slug: 'placement-done', name: 'Know thyself', nameVi: 'Biết mình', description: 'Complete the placement test', descriptionVi: 'Hoàn thành bài kiểm tra xếp lớp', icon: '🧭', tier: 'bronze', condition: { type: 'placement_completed', value: 1 }, xpReward: 50, coinReward: 10, order: 29 },
  { slug: 'level-up', name: 'One level up', nameVi: 'Lên một bậc', description: 'Move up a CEFR level', descriptionVi: 'Lên một bậc CEFR', icon: '⛰️', tier: 'gold', condition: { type: 'cefr_increased', value: 1 }, xpReward: 500, coinReward: 100, order: 30 },

  // Ẩn
  { slug: 'night-owl', name: 'Night owl', nameVi: 'Cú đêm', description: 'Study after midnight', descriptionVi: 'Học sau 0 giờ', icon: '🦉', tier: 'bronze', condition: { type: 'study_hour_after', value: 0 }, xpReward: 40, coinReward: 10, isSecret: true, order: 31 },
  { slug: 'early-bird', name: 'Early bird', nameVi: 'Chim sớm', description: 'Study before 6am', descriptionVi: 'Học trước 6 giờ sáng', icon: '🐓', tier: 'bronze', condition: { type: 'study_hour_before', value: 6 }, xpReward: 40, coinReward: 10, isSecret: true, order: 32 },
  { slug: 'persistent', name: 'Persistent', nameVi: 'Kiên trì', description: 'Seven days in a row without a freeze', descriptionVi: 'Học đủ 7 ngày liền không dùng streak freeze', icon: '🌙', tier: 'silver', condition: { type: 'streak_no_freeze', value: 7 }, xpReward: 120, coinReward: 25, isSecret: true, order: 33 },
  { slug: 'comeback', name: 'The comeback', nameVi: 'Trở lại', description: 'Return after two weeks away', descriptionVi: 'Quay lại học sau hai tuần vắng mặt', icon: '🌦️', tier: 'bronze', condition: { type: 'return_after_days', value: 14 }, xpReward: 60, coinReward: 15, isSecret: true, order: 34 },
];
