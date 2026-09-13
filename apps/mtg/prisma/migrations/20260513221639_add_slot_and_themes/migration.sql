-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "themes" TEXT[];

-- AlterTable
ALTER TABLE "DeckCard" ADD COLUMN     "slot" TEXT NOT NULL DEFAULT 'main';
