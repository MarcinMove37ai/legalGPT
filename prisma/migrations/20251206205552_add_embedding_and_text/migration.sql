-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "decisions" ADD COLUMN     "decision_text" TEXT,
ADD COLUMN     "embedding" vector(1536),
ADD COLUMN     "organizator" TEXT;
