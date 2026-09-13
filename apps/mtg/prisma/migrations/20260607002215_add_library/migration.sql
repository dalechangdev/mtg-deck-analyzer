-- CreateTable
CREATE TABLE "LibraryCard" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCard_cardId_key" ON "LibraryCard"("cardId");

-- CreateIndex
CREATE INDEX "LibraryCard_cardId_idx" ON "LibraryCard"("cardId");

-- AddForeignKey
ALTER TABLE "LibraryCard" ADD CONSTRAINT "LibraryCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
