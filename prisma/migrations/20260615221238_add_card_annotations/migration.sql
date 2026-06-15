-- CreateTable
CREATE TABLE "CardAnnotation" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardAnnotation_deckId_cardId_idx" ON "CardAnnotation"("deckId", "cardId");

-- AddForeignKey
ALTER TABLE "CardAnnotation" ADD CONSTRAINT "CardAnnotation_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAnnotation" ADD CONSTRAINT "CardAnnotation_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
