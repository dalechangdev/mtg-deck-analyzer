import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { toCardDetail } from "@/components/cards/card-grid";
import { ShoppingCartManager } from "@/components/cart/shopping-cart-manager";
import type { CartEntry } from "@/components/cart/shopping-cart-manager";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const userId = await requireUserId();

  const items = await prisma.shoppingCartCard.findMany({
    where: { userId },
    include: {
      card: {
        include: {
          printings: { take: 1, orderBy: { setCode: "desc" } },
          faces: { orderBy: { faceIndex: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const entries: CartEntry[] = items.map((item) => ({
    cartItemId: item.id,
    card: toCardDetail(item.card),
  }));

  return <ShoppingCartManager initialEntries={entries} />;
}
