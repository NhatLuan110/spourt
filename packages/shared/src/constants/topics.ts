export interface TopicSubtopicSeed {
  slug: string;
  nameEn: string;
  nameVi: string;
}

export interface TopicSeed {
  slug: string;
  nameEn: string;
  nameVi: string;
  emoji: string;
  colorToken: string;
  description: string;
  order: number;
  minWords: number;
  subtopics: TopicSubtopicSeed[];
}

/** Eight vocabulary topics plus the everyday communication collection. */
export const TOPICS: TopicSeed[] = [
  {
    slug: 'environment',
    nameEn: 'Environment',
    nameVi: 'Môi trường',
    emoji: '🌱',
    colorToken: '--primary',
    description: 'Khí hậu, ô nhiễm, năng lượng tái tạo và bảo tồn thiên nhiên.',
    order: 1,
    minWords: 100,
    subtopics: [
      { slug: 'climate-change', nameEn: 'Climate change', nameVi: 'Biến đổi khí hậu' },
      { slug: 'pollution', nameEn: 'Pollution', nameVi: 'Ô nhiễm' },
      { slug: 'renewable-energy', nameEn: 'Renewable energy', nameVi: 'Năng lượng tái tạo' },
      { slug: 'waste-recycling', nameEn: 'Waste and recycling', nameVi: 'Rác thải & tái chế' },
      { slug: 'wildlife', nameEn: 'Wildlife', nameVi: 'Động thực vật hoang dã' },
      { slug: 'conservation', nameEn: 'Conservation', nameVi: 'Bảo tồn' },
    ],
  },
  {
    slug: 'space',
    nameEn: 'Space and Universe',
    nameVi: 'Vũ trụ',
    emoji: '🌌',
    colorToken: '--info',
    description: 'Hệ mặt trời, thiên hà, du hành vũ trụ và vật lý thiên văn.',
    order: 2,
    minWords: 100,
    subtopics: [
      { slug: 'solar-system', nameEn: 'Solar system', nameVi: 'Hệ mặt trời' },
      { slug: 'galaxies-stars', nameEn: 'Galaxies and stars', nameVi: 'Thiên hà & ngôi sao' },
      { slug: 'space-travel', nameEn: 'Space travel', nameVi: 'Du hành vũ trụ' },
      { slug: 'astronauts', nameEn: 'Astronauts', nameVi: 'Phi hành gia' },
      { slug: 'satellites', nameEn: 'Satellites', nameVi: 'Vệ tinh' },
      { slug: 'astrophysics', nameEn: 'Astrophysics', nameVi: 'Vật lý thiên văn' },
    ],
  },
  {
    slug: 'education',
    nameEn: 'Education',
    nameVi: 'Giáo dục',
    emoji: '🏫',
    colorToken: '--accent',
    description: 'Trường lớp, thi cử, đại học, học trực tuyến và nghiên cứu.',
    order: 3,
    minWords: 100,
    subtopics: [
      { slug: 'school-subjects', nameEn: 'School and subjects', nameVi: 'Trường lớp & môn học' },
      { slug: 'exams', nameEn: 'Exams', nameVi: 'Thi cử' },
      { slug: 'university', nameEn: 'University', nameVi: 'Đại học' },
      { slug: 'online-learning', nameEn: 'Online learning', nameVi: 'Học trực tuyến' },
      { slug: 'stationery', nameEn: 'Stationery', nameVi: 'Dụng cụ học tập' },
      { slug: 'research', nameEn: 'Research', nameVi: 'Nghiên cứu' },
    ],
  },
  {
    slug: 'work',
    nameEn: 'Work',
    nameVi: 'Công việc',
    emoji: '💼',
    colorToken: '--bark',
    description: 'Nghề nghiệp, phỏng vấn, văn phòng, họp hành và khởi nghiệp.',
    order: 4,
    minWords: 100,
    subtopics: [
      { slug: 'jobs', nameEn: 'Jobs', nameVi: 'Nghề nghiệp' },
      { slug: 'interview-cv', nameEn: 'Interview and CV', nameVi: 'Phỏng vấn & CV' },
      { slug: 'office', nameEn: 'Office', nameVi: 'Văn phòng' },
      { slug: 'meetings', nameEn: 'Meetings', nameVi: 'Họp hành' },
      { slug: 'work-email', nameEn: 'Work email', nameVi: 'Email công việc' },
      { slug: 'salary-benefits', nameEn: 'Salary and benefits', nameVi: 'Lương & phúc lợi' },
      { slug: 'startup', nameEn: 'Startup', nameVi: 'Khởi nghiệp' },
    ],
  },
  {
    slug: 'travel',
    nameEn: 'Travel',
    nameVi: 'Du lịch',
    emoji: '✈️',
    colorToken: '--moss',
    description: 'Sân bay, khách sạn, phương tiện, hỏi đường và sự cố khi đi.',
    order: 5,
    minWords: 100,
    subtopics: [
      { slug: 'airport', nameEn: 'Airport and flights', nameVi: 'Sân bay & máy bay' },
      { slug: 'hotel', nameEn: 'Hotel', nameVi: 'Khách sạn' },
      { slug: 'transport', nameEn: 'Transport', nameVi: 'Phương tiện' },
      { slug: 'directions', nameEn: 'Directions', nameVi: 'Hỏi đường' },
      { slug: 'sightseeing', nameEn: 'Sightseeing', nameVi: 'Địa điểm tham quan' },
      { slug: 'booking', nameEn: 'Booking', nameVi: 'Đặt phòng' },
      { slug: 'travel-problems', nameEn: 'Travel problems', nameVi: 'Sự cố khi đi' },
    ],
  },
  {
    slug: 'health',
    nameEn: 'Health',
    nameVi: 'Sức khỏe',
    emoji: '🏥',
    colorToken: '--danger',
    description: 'Cơ thể, triệu chứng, khám bệnh, thuốc, dinh dưỡng và thể dục.',
    order: 6,
    minWords: 100,
    subtopics: [
      { slug: 'human-body', nameEn: 'Human body', nameVi: 'Cơ thể người' },
      { slug: 'symptoms', nameEn: 'Symptoms and illness', nameVi: 'Triệu chứng & bệnh' },
      { slug: 'doctor-visit', nameEn: 'Seeing a doctor', nameVi: 'Khám bệnh' },
      { slug: 'medicine', nameEn: 'Medicine', nameVi: 'Thuốc' },
      { slug: 'nutrition', nameEn: 'Nutrition', nameVi: 'Dinh dưỡng' },
      { slug: 'fitness', nameEn: 'Fitness', nameVi: 'Thể dục' },
      { slug: 'mental-health', nameEn: 'Mental health', nameVi: 'Sức khỏe tinh thần' },
    ],
  },
  {
    slug: 'technology',
    nameEn: 'Technology',
    nameVi: 'Công nghệ',
    emoji: '💻',
    colorToken: '--info',
    description: 'Máy tính, internet, AI & dữ liệu, mạng xã hội và lập trình.',
    order: 7,
    minWords: 100,
    subtopics: [
      { slug: 'computers', nameEn: 'Computers and hardware', nameVi: 'Máy tính & phần cứng' },
      { slug: 'internet', nameEn: 'Internet', nameVi: 'Internet' },
      { slug: 'phones', nameEn: 'Phones', nameVi: 'Điện thoại' },
      { slug: 'ai-data', nameEn: 'AI and data', nameVi: 'AI & dữ liệu' },
      { slug: 'social-media', nameEn: 'Social media', nameVi: 'Mạng xã hội' },
      { slug: 'cybersecurity', nameEn: 'Cybersecurity', nameVi: 'An ninh mạng' },
      { slug: 'programming', nameEn: 'Programming', nameVi: 'Lập trình' },
    ],
  },
  {
    slug: 'daily-life',
    nameEn: 'Daily Life',
    nameVi: 'Đời sống',
    emoji: '🏠',
    colorToken: '--clay',
    description: 'Gia đình, nhà cửa, ăn uống, mua sắm, thời tiết và cảm xúc.',
    order: 8,
    minWords: 100,
    subtopics: [
      { slug: 'family', nameEn: 'Family', nameVi: 'Gia đình' },
      { slug: 'home', nameEn: 'Home and furniture', nameVi: 'Nhà cửa & đồ đạc' },
      { slug: 'food-drink', nameEn: 'Food and drink', nameVi: 'Ăn uống' },
      { slug: 'shopping', nameEn: 'Shopping', nameVi: 'Mua sắm' },
      { slug: 'clothes', nameEn: 'Clothes', nameVi: 'Quần áo' },
      { slug: 'weather', nameEn: 'Weather', nameVi: 'Thời tiết' },
      { slug: 'hobbies', nameEn: 'Hobbies', nameVi: 'Sở thích' },
      { slug: 'emotions', nameEn: 'Emotions', nameVi: 'Cảm xúc' },
    ],
  },
  {
    slug: 'everyday-communication',
    nameEn: '2,000 Everyday English Words',
    nameVi: '2.000 từ giao tiếp thường ngày',
    emoji: '💬',
    colorToken: '--primary',
    description: 'Từ vựng giao tiếp quen thuộc, chia thành 20 nhóm, mỗi nhóm 100 từ để học và ôn tập.',
    order: 9,
    minWords: 2000,
    subtopics: Array.from({ length: 20 }, (_, index) => ({
      slug: `communication-${String(index + 1).padStart(2, '0')}`,
      nameEn: `Group ${index + 1} · Words ${index * 100 + 1}–${(index + 1) * 100}`,
      nameVi: `Nhóm ${index + 1} · Từ ${index * 100 + 1}–${(index + 1) * 100}`,
    })),
  },
];

export const TOPIC_SLUGS: string[] = TOPICS.map((topic) => topic.slug);

export interface LearningGoalOption {
  key: string;
  labelVi: string;
  topics: string[];
}

/** §7.1 step 1 — goals steer topic and scenario ordering. */
export const LEARNING_GOALS: LearningGoalOption[] = [
  { key: 'work-communication', labelVi: 'Giao tiếp công việc', topics: ['work', 'daily-life'] },
  { key: 'ielts', labelVi: 'Du học / IELTS', topics: ['education', 'environment', 'technology'] },
  { key: 'travel', labelVi: 'Đi du lịch', topics: ['travel', 'daily-life', 'health'] },
  { key: 'movies', labelVi: 'Xem phim không phụ đề', topics: ['daily-life', 'technology'] },
  { key: 'academic', labelVi: 'Học thuật', topics: ['education', 'space', 'environment'] },
  { key: 'school-exams', labelVi: 'Thi cử ở trường', topics: ['education', 'environment', 'work'] },
];

/** §7.1 step 2 — daily commitment presets. */
export const DAILY_GOAL_PRESETS = [
  { minutes: 5, xp: 15, newWordsPerDay: 5, maxReviewsPerDay: 40 },
  { minutes: 10, xp: 25, newWordsPerDay: 10, maxReviewsPerDay: 80 },
  { minutes: 15, xp: 30, newWordsPerDay: 15, maxReviewsPerDay: 120 },
  { minutes: 30, xp: 60, newWordsPerDay: 25, maxReviewsPerDay: 200 },
  { minutes: 60, xp: 120, newWordsPerDay: 40, maxReviewsPerDay: 320 },
] as const;
