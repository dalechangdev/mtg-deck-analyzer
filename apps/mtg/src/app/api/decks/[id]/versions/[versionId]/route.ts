import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVersionAccess } from "@/lib/ownership";
import { deckEntryInclude, deckEntryOrderBy, toDeckEntry } from "@/lib/deck-entry";
import { isUniqueViolation, readJsonBody } from "@/lib/template-input";
import {
  VERSION_NAME_TAKEN,
  parseVersionName,
  parseVersionNotes,
} from "@/lib/deck-version-input";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

/** GET — the version and its card entries. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id: deckId, versionId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const [version, cards] = await Promise.all([
    prisma.deckVersion.findUnique({
      where: { id: versionId },
      select: { id: true, name: true, notes: true, parentVersionId: true },
    }),
    prisma.deckCard.findMany({
      where: { versionId },
      include: deckEntryInclude,
      orderBy: deckEntryOrderBy,
    }),
  ]);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...version, entries: cards.map(toDeckEntry) });
}

/** PATCH { name?, notes? } — rename, or edit the version's notes (null clears them). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id: deckId, versionId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const body = await readJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  const data: { name?: string; notes?: string | null } = {};

  if ("name" in body.value) {
    const name = parseVersionName(body.value.name);
    if (!name.ok) return NextResponse.json({ error: name.error }, { status: name.status });
    data.name = name.value;
  }
  if ("notes" in body.value) {
    const notes = parseVersionNotes(body.value.notes);
    if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: notes.status });
    data.notes = notes.value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "name or notes required" }, { status: 400 });
  }

  try {
    // The gate established this version belongs to the caller's deck.
    const updated = await prisma.deckVersion.update({
      where: { id: versionId },
      data,
      select: { id: true, name: true, notes: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (isUniqueViolation(error, "name")) {
      return NextResponse.json({ error: VERSION_NAME_TAKEN }, { status: 409 });
    }
    throw error;
  }
}

/**
 * DELETE — remove the version, its cards and its game log.
 *
 * A deck always keeps at least one version, so the last one answers 409. If the
 * deleted version was current, "current" passes to its parent when that still
 * exists, otherwise to the newest remaining version.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id: deckId, versionId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const outcome = await prisma.$transaction(async (tx) => {
    // Serialise deletes per deck. Without the lock, two requests deleting the
    // last two versions could each see the other's version as "remaining" and
    // together leave the deck with none.
    await tx.$queryRaw`SELECT id FROM "Deck" WHERE id = ${deckId} FOR UPDATE`;

    const version = await tx.deckVersion.findFirst({
      where: { id: versionId, deckId },
      select: { parentVersionId: true },
    });
    if (!version) return "gone" as const;

    const remaining = await tx.deckVersion.findMany({
      where: { deckId, id: { not: versionId } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (remaining.length === 0) return "last" as const;

    const deck = await tx.deck.findUnique({
      where: { id: deckId },
      select: { currentVersionId: true },
    });
    if (deck?.currentVersionId === versionId) {
      const next = remaining.find((v) => v.id === version.parentVersionId) ?? remaining[0];
      await tx.deck.update({ where: { id: deckId }, data: { currentVersionId: next.id } });
    }

    await tx.deckVersion.delete({ where: { id: versionId } });
    return "deleted" as const;
  });

  if (outcome === "gone") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (outcome === "last") {
    return NextResponse.json(
      { error: "A deck needs at least one version — this is its last" },
      { status: 409 }
    );
  }
  return new NextResponse(null, { status: 204 });
}
