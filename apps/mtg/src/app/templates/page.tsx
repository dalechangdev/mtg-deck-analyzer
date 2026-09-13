import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { TemplateManager } from "@/components/templates/template-manager";

export default async function TemplatesPage() {
  const userId = await requireUserId();

  const [templates, roles] = await Promise.all([
    // Own templates plus the shared reference ones.
    prisma.analysisTemplate.findMany({
      where: { OR: [{ ownerId: userId }, { ownerId: null }] },
      orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
      include: {
        requirements: {
          orderBy: { sortOrder: "asc" },
          select: {
            roleId: true,
            targetCount: true,
            minCount: true,
            maxCount: true,
            note: true,
          },
        },
      },
    }),
    prisma.cardRole.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    }),
  ]);

  return (
    <TemplateManager
      initialTemplates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        format: t.format,
        deckSize: t.deckSize,
        isBuiltIn: t.isBuiltIn,
        requirements: t.requirements,
      }))}
      roles={roles}
    />
  );
}
