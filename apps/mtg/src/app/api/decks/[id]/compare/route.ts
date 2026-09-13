import { NextResponse } from "next/server";
import { requireDeckAccess } from "@/lib/ownership";
import { resolveTemplateId } from "@/lib/deck-template-loader";
import { loadVersionComparison, resolveComparePair } from "@/lib/deck-version-loader";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/decks/[id]/compare?a=…&b=…&templateId=…
 *
 * Version `a` (default: current) against baseline `b` (default: a's parent,
 * else the newest other version): the card diff from b to a, each side's
 * stats and game record, and both scored against one template. Computed per
 * request, never stored.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  const url = new URL(req.url);

  const pair = await resolveComparePair(id, url.searchParams.get("a"), url.searchParams.get("b"));
  if (!pair.ok) {
    return pair.reason === "not-found"
      ? NextResponse.json({ error: "Version not found" }, { status: 404 })
      : NextResponse.json(
          { error: "This deck has one version — there's nothing to compare it with" },
          { status: 400 }
        );
  }

  const templateId = await resolveTemplateId(id, url.searchParams.get("templateId"));
  const comparison = await loadVersionComparison(id, pair.a, pair.b, templateId, access.userId);
  if (!comparison) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json(comparison);
}
