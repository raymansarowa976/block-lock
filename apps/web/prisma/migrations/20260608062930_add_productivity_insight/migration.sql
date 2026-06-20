-- CreateTable
CREATE TABLE "ProductivityInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductivityInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductivityInsight_userId_createdAt_idx" ON "ProductivityInsight"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductivityInsight" ADD CONSTRAINT "ProductivityInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
