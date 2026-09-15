import { NextResponse } from "next/server";
import {
  loadDeckCards,
  loadRoleOverrides,
  loadTemplate,
  resolveTemplateId,
} from "@/lib/deck-template-loader";
import { evaluateTemplate } from "@/lib/deck-template";
import { analyzeLandBase } from "@/lib/land-base";
import { requireDeckAccess } from "@/lib/ownership";
import { resolveVersionId } from "@/lib/deck-version-loader";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/decks/[id]/analysis?templateId=…&versionId=…&includeCommander=1
 *
 * Analyses are computed per request, never stored — a card swap can't leave a
 * stale scorecard behind. Falls back to the deck's attached template, then to
 * the built-in baseline; and to the deck's current version. A versionId that
 * isn't a version of this deck answers 404.
 *
 * Also returns `landBase`, the land base matrix for the same version. It doesn't
 * depend on the template or on `includeCommander`.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  const url = new URL(req.url);

  const [templateId, versionId] = await Promise.all([
    resolveTemplateId(id, url.searchParams.get("templateId")),
    resolveVersionId(id, url.searchParams.get("versionId")),
  ]);
  if (!versionId) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const includeCommander = url.searchParams.get("includeCommander") === "1";

  const [template, entries, overrides] = await Promise.all([
    loadTemplate(templateId, access.userId),
    loadDeckCards(versionId),
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

  // Counted from the entries already loaded, so the matrix costs no extra query.
  const landBase = analyzeLandBase(entries);

  return NextResponse.json({ analysis, cards, landBase });
}
