-- CreateTable
CREATE TABLE "ShoppingCartCard" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingCartCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingCartCard_cardId_key" ON "ShoppingCartCard"("cardId");

-- CreateIndex
CREATE INDEX "ShoppingCartCard_cardId_idx" ON "ShoppingCartCard"("cardId");

-- AddForeignKey
ALTER TABLE "ShoppingCartCard" ADD CONSTRAINT "ShoppingCartCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
