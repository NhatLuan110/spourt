-- CreateEnum
CREATE TYPE "LearningTrack" AS ENUM ('ENGLISH', 'CHINESE');

-- CreateEnum
CREATE TYPE "HskLevel" AS ENUM ('HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6');

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "activeTrack" "LearningTrack" NOT NULL DEFAULT 'ENGLISH',
ADD COLUMN     "hanziPerDay" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "hskTarget" "HskLevel" NOT NULL DEFAULT 'HSK1';

-- CreateTable
CREATE TABLE "Hanzi" (
    "id" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "traditional" TEXT,
    "pinyinNumeric" TEXT,
    "hanViet" TEXT,
    "strokeCount" INTEGER,
    "radical" TEXT,
    "meaningVi" TEXT,
    "hskLevel" "HskLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hanzi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChineseWord" (
    "id" TEXT NOT NULL,
    "simplified" TEXT NOT NULL,
    "traditional" TEXT,
    "pinyin" TEXT NOT NULL,
    "pinyinNumeric" TEXT,
    "hanViet" TEXT,
    "meaningVi" TEXT NOT NULL,
    "meaningEn" TEXT,
    "hskLevel" "HskLevel" NOT NULL,
    "frequencyRank" INTEGER,
    "radical" TEXT,
    "pos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "classifiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChineseWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChineseWordHanzi" (
    "wordId" TEXT NOT NULL,
    "hanziId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ChineseWordHanzi_pkey" PRIMARY KEY ("wordId","position")
);

-- CreateTable
CREATE TABLE "ChineseExample" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "simplified" TEXT NOT NULL,
    "pinyin" TEXT,
    "translationVi" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChineseExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserChineseWord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "state" "SrsState" NOT NULL DEFAULT 'NEW',
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "learningStep" INTEGER NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "correctReviews" INTEGER NOT NULL DEFAULT 0,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserChineseWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserHanzi" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hanziId" TEXT NOT NULL,
    "state" "SrsState" NOT NULL DEFAULT 'NEW',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "sheetsPrinted" INTEGER NOT NULL DEFAULT 0,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserHanzi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hanzi_character_key" ON "Hanzi"("character");

-- CreateIndex
CREATE INDEX "Hanzi_hskLevel_strokeCount_idx" ON "Hanzi"("hskLevel", "strokeCount");

-- CreateIndex
CREATE INDEX "Hanzi_strokeCount_idx" ON "Hanzi"("strokeCount");

-- CreateIndex
CREATE UNIQUE INDEX "ChineseWord_simplified_key" ON "ChineseWord"("simplified");

-- CreateIndex
CREATE INDEX "ChineseWord_hskLevel_frequencyRank_idx" ON "ChineseWord"("hskLevel", "frequencyRank");

-- CreateIndex
CREATE INDEX "ChineseWord_pinyinNumeric_idx" ON "ChineseWord"("pinyinNumeric");

-- CreateIndex
CREATE INDEX "ChineseWordHanzi_hanziId_idx" ON "ChineseWordHanzi"("hanziId");

-- CreateIndex
CREATE INDEX "ChineseExample_wordId_idx" ON "ChineseExample"("wordId");

-- CreateIndex
CREATE INDEX "UserChineseWord_userId_dueAt_idx" ON "UserChineseWord"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "UserChineseWord_userId_state_idx" ON "UserChineseWord"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "UserChineseWord_userId_wordId_key" ON "UserChineseWord"("userId", "wordId");

-- CreateIndex
CREATE INDEX "UserHanzi_userId_dueAt_idx" ON "UserHanzi"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserHanzi_userId_hanziId_key" ON "UserHanzi"("userId", "hanziId");

-- AddForeignKey
ALTER TABLE "ChineseWordHanzi" ADD CONSTRAINT "ChineseWordHanzi_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "ChineseWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChineseWordHanzi" ADD CONSTRAINT "ChineseWordHanzi_hanziId_fkey" FOREIGN KEY ("hanziId") REFERENCES "Hanzi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChineseExample" ADD CONSTRAINT "ChineseExample_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "ChineseWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChineseWord" ADD CONSTRAINT "UserChineseWord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChineseWord" ADD CONSTRAINT "UserChineseWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "ChineseWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserHanzi" ADD CONSTRAINT "UserHanzi_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserHanzi" ADD CONSTRAINT "UserHanzi_hanziId_fkey" FOREIGN KEY ("hanziId") REFERENCES "Hanzi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
