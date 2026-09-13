import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageShell } from "@/components/ui/shell";
import { GameLog } from "@/components/decks/game-log";
import { loadVersionSummaries, resolveVersionId } from "@/lib/deck-version-loader";
import { gameLogOrderBy, toGameLogEntry } from "@/lib/game-log-input";
import { deckPageUrl, gamesPageUrl } from "@/lib/deck-api";
import { cn } from "@/lib/utils";

export default async function GameLogPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id, versionId: requested } = await params;
  const userId = await requireUserId();

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    select: { name: true },
  });
  if (!deck) notFound();

  // Only after the ownership check above: resolveVersionId trusts its deckId,
  // and answers null for a version that isn't this deck's.
  const versionId = await resolveVersionId(id, requested);
  if (!versionId) notFound();

  const [versions, games] = await Promise.all([
    loadVersionSummaries(id),
    prisma.gameLog.findMany({ where: { versionId }, orderBy: gameLogOrderBy }),
  ]);

  const version = versions.find((v) => v.id === versionId);
  if (!version) notFound();

  const { wins, losses, draws } = version.record;
  const decided = wins + losses + draws;

  return (
    <PageShell className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-title font-semibold truncate">
            {deck.name} · {version.name}
          </h1>
          <p className="text-body text-muted-foreground">
            {version.record.games === 0
              ? "No games logged yet"
              : `${version.record.games} game${version.record.games === 1 ? "" : "s"} · ${wins}W · ${losses}L · ${draws}D`}
            {decided > 0 && ` · ${Math.round((wins / decided) * 100)}% win rate`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-body">
          <Link
            href={deckPageUrl(id, versionId, "/versions")}
            className="text-muted-foreground hover:text-foreground"
          >
            All versions
          </Link>
          <Link href={deckPageUrl(id, versionId)} className="text-muted-foreground hover:text-foreground">
            ← Back to builder
          </Link>
        </div>
      </div>

      {versions.length > 1 && (
        <nav aria-label="Other versions' game logs" className="flex flex-wrap items-center gap-1.5">
          {versions.map((v) => (
            <Link
              key={v.id}
              href={gamesPageUrl(id, v.id)}
              aria-current={v.id === versionId ? "page" : undefined}
              className={cn(
                "text-body px-2 py-0.5 rounded-md border transition-colors",
                v.id === versionId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {v.name}
              <span className="ml-1.5 text-label text-muted-foreground">{v.record.games}</span>
            </Link>
          ))}
        </nav>
      )}

      <GameLog key={versionId} deckId={id} versionId={versionId} games={games.map(toGameLogEntry)} />
    </PageShell>
  );
}
