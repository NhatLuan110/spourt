import { z } from 'zod';

export const EXAM_IDS = ['ielts', 'toeic', 'aptis'] as const;
export const EXAM_LEVEL_IDS = ['1', '2', '3', '4'] as const;
export const EXAM_SKILLS = ['reading', 'listening', 'writing', 'speaking'] as const;
export const examIdSchema = z.enum(EXAM_IDS);
export const examLevelIdSchema = z.enum(EXAM_LEVEL_IDS);
export const examSkillSchema = z.enum(EXAM_SKILLS);
export type ExamId = z.infer<typeof examIdSchema>;
export type ExamLevelId = z.infer<typeof examLevelIdSchema>;
export type ExamSkill = z.infer<typeof examSkillSchema>;
const text = z.string().trim().min(1);
const identifier = text.max(160).regex(/^[a-z0-9-]+$/);

export const examWordSchema = z.object({
  id: identifier,
  term: text,
  ipa: text,
  meaningVi: text,
  definitionEn: text,
  example: text,
  exampleVi: text,
  collocations: z.array(text).min(1),
});
export type ExamWord = z.infer<typeof examWordSchema>;

export const examQuestionSchema = z.object({
  id: identifier,
  kind: z.enum(['mcq', 'short-answer']),
  prompt: text,
  options: z.array(z.object({ id: identifier, text })).min(2).max(10).optional(),
});
export type ExamQuestion = z.infer<typeof examQuestionSchema>;
export const examContentQuestionSchema = examQuestionSchema.extend({
  answer: text,
  accepted: z.array(text).optional(),
  explanationVi: text,
}).superRefine((question, ctx) => {
  if (question.kind === 'mcq') {
    const options = question.options ?? [];
    if (!options.some((option) => option.id === question.answer)
      || new Set(options.map((option) => option.id)).size !== options.length
      || new Set(options.map((option) => option.text.toLowerCase())).size !== options.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'MCQ must have distinct options and a valid answer.' });
    }
  } else if (question.options) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Short answers cannot have options.' });
  }
});

export const examActivitySchema = z.object({
  id: identifier,
  skill: examSkillSchema,
  title: text,
  format: text,
  instructionsVi: text,
  promptEn: text,
  passage: text.optional(),
  transcript: z.array(z.object({ speaker: text, text })).min(1).optional(),
  accent: z.enum(['us', 'uk']).optional(),
  timeLimitSec: z.number().int().positive().max(14400),
  preparationSec: z.number().int().min(0).max(600).optional(),
  minWords: z.number().int().positive().optional(),
  maxWords: z.number().int().positive().optional(),
  questions: z.array(examQuestionSchema).min(1).optional(),
  rubricVi: z.array(text).optional(),
});
/** The public activity never carries an answer key or model response. */
export type ExamActivity = z.infer<typeof examActivitySchema>;
export const examContentActivitySchema = examActivitySchema.extend({
  questions: z.array(examContentQuestionSchema).min(1).optional(),
  sampleAnswer: text.optional(),
}).superRefine((activity, ctx) => {
  const objective = activity.skill === 'reading' || activity.skill === 'listening';
  if (objective && !activity.questions?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reading/listening require questions.' });
  }
  if (!objective && (activity.questions || !activity.sampleAnswer || !activity.rubricVi?.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Writing/speaking require a model and rubric, without objective questions.' });
  }
  if (activity.skill === 'reading' && !activity.passage) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reading requires its source passage.' });
  }
  if (activity.skill === 'listening' && (!activity.transcript?.length || !activity.accent)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Listening requires a transcript and accent.' });
  }
  if (activity.skill === 'writing' && (!activity.minWords || !activity.maxWords || activity.minWords > activity.maxWords)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Writing requires a valid word range.' });
  }
  if (activity.questions && new Set(activity.questions.map((question) => question.id)).size !== activity.questions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Question IDs must be unique within an activity.' });
  }
});
export type ExamContentActivity = z.infer<typeof examContentActivitySchema>;
export const examContentPackSchema = z.object({
  examId: examIdSchema,
  levelId: examLevelIdSchema,
  vocabulary: z.array(examWordSchema).min(1),
  activities: z.array(examContentActivitySchema).min(1),
}).superRefine((pack, ctx) => {
  if (new Set(pack.vocabulary.map((word) => word.id)).size !== pack.vocabulary.length
    || new Set(pack.activities.map((activity) => activity.id)).size !== pack.activities.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Word and activity IDs must be unique within a pack.' });
  }
  for (const skill of EXAM_SKILLS) {
    if (!pack.activities.some((activity) => activity.skill === skill)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Missing skill: ${skill}` });
    }
  }
});
export type ExamContentPack = z.infer<typeof examContentPackSchema>;
export interface ExamPack {
  examId: ExamId;
  levelId: ExamLevelId;
  vocabulary: ExamWord[];
  activities: ExamActivity[];
}

export interface ExamCounts {
  vocabulary: number;
  reading: number;
  listening: number;
  writing: number;
  speaking: number;
}
export interface ExamLevelDefinition {
  id: ExamLevelId;
  label: string;
  targetLabel: string;
  speakingWritingTargetLabel?: string;
  stretchLabel: string;
  descriptionVi: string;
}
export interface ExamDefinition {
  id: ExamId;
  name: string;
  variant: string;
  descriptionVi: string;
  scoreNoteVi: string;
  sourceUrl: string;
  levels: ExamLevelDefinition[];
}
export type ExamLevel = ExamLevelDefinition & { counts: ExamCounts };
export type ExamCatalog = (Omit<ExamDefinition, 'levels'> & { levels: ExamLevel[] })[];

export const examSubmitSchema = z.object({
  answers: z.array(z.object({ questionId: identifier, value: text.max(1000) }).strict()).max(100).optional(),
  content: text.max(30000).optional(),
  elapsedSec: z.number().int().min(0).max(86400),
}).strict();
export type ExamSubmitInput = z.infer<typeof examSubmitSchema>;
export interface ExamResult {
  activityId: string;
  correctCount: number | null;
  total: number | null;
  feedback: { questionId: string; correct: boolean; answer: string; explanationVi: string }[];
  sampleAnswer?: string;
  rubricVi: string[];
  withinTime: boolean;
  submittedAt: string;
}
export interface ExamAttemptSummary {
  id: string;
  examId: ExamId;
  levelId: ExamLevelId;
  activityId: string;
  skill: ExamSkill;
  correctCount: number | null;
  total: number | null;
  elapsedSec: number;
  completedAt: string;
}
export const examHistoryQuerySchema = z.object({
  examId: examIdSchema.optional(),
  levelId: examLevelIdSchema.optional(),
});
export type ExamHistoryQuery = z.infer<typeof examHistoryQuerySchema>;
