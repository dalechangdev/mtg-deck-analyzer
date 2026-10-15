import { requireUserIdOr401 } from "@/lib/auth";
import { createDeckFromSearch } from "@/lib/price-history";

type Ctx = { params: Promise<{ id: string }> };

/** Turns one of the caller's saved searches into a new deck. Another account's id is a 404. */
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { id } = await params;
  const created = await createDeckFromSearch(auth.userId, id);
  if (!created) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ id: created.deckId, unknown: created.unknown }, { status: 201 });
}
