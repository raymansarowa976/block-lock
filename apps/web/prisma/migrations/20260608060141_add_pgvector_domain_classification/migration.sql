-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "DomainEmbedding" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistractionBaseline" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistractionBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainEmbedding_domain_key" ON "DomainEmbedding"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "DistractionBaseline_label_key" ON "DistractionBaseline"("label");
