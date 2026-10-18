import { prisma } from "@/lib/prisma";
import { usableTemplateWhere } from "@/lib/template-visibility";
import { DEFAULT_TEMPLATE_ID } from "@/lib/deck-template-loader";
import { requireUserId } from "@/lib/auth";
import { PageShell } from "@/components/ui/shell";
import { StartDeckForm, type TemplateOption } from "@/components/decks/start-deck-form";
import { toImageUrl } from "@/lib/card-detail";
import type { CardData } from "@/lib/commander";

/** Template builder, step one: commander and template, then straight into /build. */
export default async function StartDeckPage({
  searchParams,
}: {
  searchParams: Promise<{ commander?: string }>;
}) {
  const userId = await requireUserId();
  const { commander: commanderId } = await searchParams;

  // The caller's own templates plus the shared reference ones (ownerId null).
  const templates = await prisma.analysisTemplate.findMany({
    where: usableTemplateWhere(userId),
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
    include: {
      requirements: {
        orderBy: { sortOrder: "asc" },
        include: { role: { select: { name: true } } },
      },
    },
  });

  const options: TemplateOption[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    deckSize: t.deckSize,
    isBuiltIn: t.isBuiltIn,
    requirements: t.requirements.map((r) => ({ roleName: r.role.name, targetCount: r.targetCount })),
  }));

  // `?commander=` pre-fills step one — the Build button on /commanders links here.
  // Card is shared reference data, so there's no userId filter; an id that isn't
  // a legal commander is ignored and the picker starts empty.
  const commanderCard = commanderId
    ? await prisma.card.findFirst({
        where: { id: commanderId, canBeCommander: true, isCommanderLegal: true },
        include: {
          printings: { take: 1, orderBy: { setCode: "desc" } },
          faces: { take: 1, orderBy: { faceIndex: "asc" } },
        },
      })
    : null;
  const initialCommander: CardData | null = commanderCard && {
    cardId: commanderCard.id,
    name: commanderCard.name,
    manaCost: commanderCard.manaCost,
    cmc: commanderCard.cmc,
    typeLine: commanderCard.typeLine,
    oracleText: commanderCard.oracleText,
    colorIdentity: commanderCard.colorIdentity,
    keywords: commanderCard.keywords,
    canBeCommander: commanderCard.canBeCommander,
    imageUrl: toImageUrl(commanderCard.printings, commanderCard.faces),
  };

  return (
    <PageShell className="max-w-2xl space-y-0">
      <h1 className="text-title font-semibold mb-1">Build from a template</h1>
      <p className="text-body text-muted-foreground mb-6">
        Pick a commander and a template. The builder then suggests cards for each requirement.
      </p>
      <StartDeckForm
        templates={options}
        defaultTemplateId={DEFAULT_TEMPLATE_ID}
        initialCommander={initialCommander}
      />
    </PageShell>
  );
}
