-- Sentence transformation ("viết lại câu") is a distinct exercise type, not a
-- short answer with extra fields: it has a source sentence, a required cue the
-- learner must use, and several equally correct answers. Grading differs too —
-- an answer that means the right thing but ignores the cue is half right, which
-- no other type has to express.
ALTER TYPE "ExerciseType" ADD VALUE IF NOT EXISTS 'REWRITE';
