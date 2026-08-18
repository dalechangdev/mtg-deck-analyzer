import { prisma } from "@/lib/prisma";
import { TemplateManager } from "@/components/templates/template-manager";

export default async function TemplatesPage() {
  const [templates, roles] = await Promise.all([
    prisma.analysisTemplate.findMany({
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
