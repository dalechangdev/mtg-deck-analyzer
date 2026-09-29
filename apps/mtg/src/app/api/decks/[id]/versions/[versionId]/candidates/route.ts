import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVersionAccess } from "@/lib/ownership";
import { getCardPool } from "@/lib/card-pool";
import { toImageUrl } from "@/lib/card-detail";
import { evaluateTemplate } from "@/lib/deck-template";
import {
  loadDeckCards,
  loadRoleOverrides,
  loadTemplate,
  resolveTemplateId,
} from "@/lib/deck-template-loader";
import { selectCandidates, type CandidatesResponse } from "@/lib/template-candidates";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

/**
 * GET ?roleId=&q=&owned=1&offset=&limit= — cards that could fill one
 * requirement of the deck's attached template, best first. See
 * docs/plans/template-builder.md for the ranking and exclusions.
 *
 * The role must belong to the template: that keeps the matchers we run to ones
 * the caller can already see, rather than any role id in the database.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id: deckId, versionId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("roleId");
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "40") || 40, 1), 100);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0") || 0);

  const template = await loadTemplate(await resolveTemplateId(deckId), access.userId);
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const role = template.requirements.find((r) => r.role.id === roleId)?.role;
  if (!role) return NextResponse.json({ error: "Role is not in this deck's template" }, { status: 400 });

  const [entries, overrides, library, pool] = await Promise.all([
    loadDeckCards(versionId),
    loadRoleOverrides(deckId),
    prisma.libraryCard.findMany({
      where: { userId: access.userId, quantity: { gt: 0 } },
      select: { cardId: true },
    }),
    getCardPool(),
  ]);

  const analysis = evaluateTemplate(entries, template, overrides);
  const commander = entries.find((e) => e.isCommander);

  const matches = selectCandidates(
    pool.cards,
    {
      role,
      templateRoles: template.requirements.map((r) => r.role),
      gapRoleIds: new Set(
        analysis.requirements.filter((r) => r.status === "under").map((r) => r.roleId)
      ),
      identity: commander?.colorIdentity ?? null,
      deck: entries,
      overrides,
      ownedIds: new Set(library.map((l) => l.cardId)),
      text: searchParams.get("q") ?? "",
      ownedOnly: searchParams.get("owned") === "1",
    },
    pool.matchSetFor
  );

  // Only the page being returned needs images.
  const page = matches.slice(offset, offset + limit);
  const images = await prisma.card.findMany({
    where: { id: { in: page.map((c) => c.card.cardId) } },
    select: {
      id: true,
      printings: { take: 1, orderBy: { setCode: "desc" }, select: { imageUris: true } },
      faces: { take: 1, orderBy: { faceIndex: "asc" }, select: { imageUri: true } },
    },
  });
  const imageById = new Map(images.map((c) => [c.id, toImageUrl(c.printings, c.faces)]));

  const body: CandidatesResponse = {
    total: matches.length,
    candidates: page.map(({ card, ...tags }) => ({
      ...card,
      imageUrl: imageById.get(card.cardId) ?? null,
      ...tags,
    })),
  };
  return NextResponse.json(body);
}
