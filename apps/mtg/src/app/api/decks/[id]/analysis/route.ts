import { NextResponse } from "next/server";
import {
  loadDeckCards,
  loadRoleOverrides,
  loadTemplate,
  resolveTemplateId,
} from "@/lib/deck-template-loader";
import { evaluateTemplate } from "@/lib/deck-template";
import { requireDeckAccess } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/decks/[id]/analysis?templateId=…&includeCommander=1
 *
 * Analyses are computed per request, never stored — a card swap can't leave a
 * stale scorecard behind. Falls back to the deck's attached template, then to
 * the built-in baseline.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  const url = new URL(req.url);

  const templateId = await resolveTemplateId(id, url.searchParams.get("templateId"));
  const includeCommander = url.searchParams.get("includeCommander") === "1";

  const [template, entries, overrides] = await Promise.all([
    loadTemplate(templateId, access.userId),
    loadDeckCards(id),
    loadRoleOverrides(id),
  ]);
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const analysis = evaluateTemplate(entries, template, overrides, { includeCommander });

  // Card names travel with the analysis so clients can render the per-role
  // lists without a second round trip.
  const cards = entries.map((e) => ({
    cardId: e.cardId,
    name: e.name,
    manaCost: e.manaCost,
    typeLine: e.typeLine,
  }));

  return NextResponse.json({ analysis, cards });
}
