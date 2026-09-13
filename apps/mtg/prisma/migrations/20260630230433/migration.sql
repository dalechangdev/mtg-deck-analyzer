-- AlterTable
ALTER TABLE "_CardToCardTheme" ADD CONSTRAINT "_CardToCardTheme_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CardToCardTheme_AB_unique";

-- AlterTable
ALTER TABLE "_DeckToDeckTheme" ADD CONSTRAINT "_DeckToDeckTheme_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_DeckToDeckTheme_AB_unique";
