import { requireUserIdOr401 } from "@/lib/auth";
import { deleteSearch } from "@/lib/price-history";

type Ctx = { params: Promise<{ id: string }> };

/** Deletes one of the caller's saved searches. Another account's id is a 404. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { id } = await params;
  if (!(await deleteSearch(auth.userId, id))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
