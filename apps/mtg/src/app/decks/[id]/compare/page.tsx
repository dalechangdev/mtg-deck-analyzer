import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageShell } from "@/components/ui/shell";
import { VersionCompare } from "@/components/decks/version-compare";
import { resolveTemplateId } from "@/lib/deck-template-loader";
import {
  loadVersionComparison,
  resolveComparePair,
  resolveVersionId,
} from "@/lib/deck-version-loader";
import { deckPageUrl } from "@/lib/deck-api";

function param(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function CompareVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const userId = await requireUserId();

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    select: { name: true },
  });
  if (!deck) notFound();

  // Only after the ownership check above: these trust their deckId.
  const pair = await resolveComparePair(id, param(query.a), param(query.b));
  if (!pair.ok) {
    if (pair.reason === "not-found") notFound();

    const current = await resolveVersionId(id);
    return (
      <PageShell className="space-y-3">
        <h1 className="text-title font-semibold">{deck.name}</h1>
        <p className="text-ui text-muted-foreground">
          This deck has one version, so there&apos;s nothing to compare it with yet. Make a new
          version from it, swap some cards, and come back.
        </p>
        {current && (
          <Link
            href={deckPageUrl(id, current, "/versions")}
            className="inline-block text-body text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Go to versions
          </Link>
        )}
      </PageShell>
    );
  }

  const templateId = await resolveTemplateId(id, param(query.templateId));
  const [comparison, templates] = await Promise.all([
    loadVersionComparison(id, pair.a, pair.b, templateId, userId),
    // The caller's own templates plus the shared reference ones — never another account's.
    prisma.analysisTemplate.findMany({
      where: { OR: [{ ownerId: userId }, { ownerId: null }] },
      orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isBuiltIn: true },
    }),
  ]);
  // Null when the template was deleted or isn't visible to this account.
  if (!comparison) notFound();

  return (
    <PageShell className="space-y-6">
      <VersionCompare
        deckId={id}
        deckName={deck.name}
        comparison={comparison}
        templates={templates}
      />
    </PageShell>
  );
}
