import { prisma } from "@/lib/prisma";
import { usableTemplateWhere } from "@/lib/template-visibility";
import { DEFAULT_TEMPLATE_ID } from "@/lib/deck-template-loader";
import { requireUserId } from "@/lib/auth";
import { PageShell } from "@/components/ui/shell";
import { StartDeckForm, type TemplateOption } from "@/components/decks/start-deck-form";

/** Template builder, step one: commander and template, then straight into /build. */
export default async function StartDeckPage() {
  const userId = await requireUserId();

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

  return (
    <PageShell className="max-w-2xl space-y-0">
      <h1 className="text-title font-semibold mb-1">Build from a template</h1>
      <p className="text-body text-muted-foreground mb-6">
        Pick a commander and a template. The builder then suggests cards for each requirement.
      </p>
      <StartDeckForm templates={options} defaultTemplateId={DEFAULT_TEMPLATE_ID} />
    </PageShell>
  );
}
