ALTER TABLE "EssayDraft" ADD COLUMN "promptId" TEXT;
ALTER TABLE "EssayDraft" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "QuizAttempt" ADD COLUMN "keyStatus" TEXT NOT NULL DEFAULT 'verified';
