import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageShell } from "@/components/ui/shell";
import { VersionManager } from "@/components/decks/version-manager";
import { loadVersionSummaries, resolveVersionId } from "@/lib/deck-version-loader";
import { deckPageUrl } from "@/lib/deck-api";

export default async function DeckVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const userId = await requireUserId();

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    select: { name: true },
  });
  if (!deck) notFound();

  // Only after the ownership check above: these trust their deckId.
  const [versionId, versions] = await Promise.all([
    resolveVersionId(id, typeof v === "string" ? v : null),
    loadVersionSummaries(id),
  ]);
  if (!versionId) notFound();

  return (
    <PageShell className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-title font-semibold truncate">{deck.name}</h1>
          <p className="text-body text-muted-foreground">
            {versions.length} version{versions.length === 1 ? "" : "s"} · click a name to rename it
          </p>
        </div>
        <Link
          href={deckPageUrl(id, versionId)}
          className="ml-auto text-body text-muted-foreground hover:text-foreground"
        >
          ← Back to builder
        </Link>
      </div>

      <VersionManager deckId={id} versionId={versionId} versions={versions} />
    </PageShell>
  );
}
