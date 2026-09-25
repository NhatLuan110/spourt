CREATE TABLE "ExamPrepAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "answersJson" JSONB,
    "content" TEXT,
    "correctCount" INTEGER,
    "total" INTEGER,
    "elapsedSec" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamPrepAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExamPrepAttempt_userId_completedAt_idx" ON "ExamPrepAttempt"("userId", "completedAt");
CREATE INDEX "ExamPrepAttempt_userId_examId_levelId_idx" ON "ExamPrepAttempt"("userId", "examId", "levelId");
ALTER TABLE "ExamPrepAttempt" ADD CONSTRAINT "ExamPrepAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
