-- CreateTable
CREATE TABLE "decisions" (
    "id" TEXT NOT NULL,
    "document_date" TEXT,
    "decision_number" TEXT,
    "ban_years" INTEGER,
    "legal_basis_kpa" TEXT,
    "legal_basis_uitput" TEXT,
    "appeal_days" INTEGER,
    "appeal_court" TEXT,
    "signed_by" TEXT,
    "file_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);
