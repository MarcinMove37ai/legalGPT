-- CreateTable
CREATE TABLE "ExtensionDraft" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "decisionNumber" TEXT NOT NULL,
    "organizer" TEXT NOT NULL,
    "legalForm" TEXT NOT NULL,
    "organizerAddress" TEXT NOT NULL,
    "documentDate" TEXT NOT NULL,
    "decisionText" TEXT NOT NULL,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionDraft_decisionId_key" ON "ExtensionDraft"("decisionId");

-- AddForeignKey
ALTER TABLE "ExtensionDraft" ADD CONSTRAINT "ExtensionDraft_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
