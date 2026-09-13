import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDeckAccess } from "@/lib/ownership";
import { loadVersionSummaries, resolveVersionId } from "@/lib/deck-version-loader";
import { isUniqueViolation, readJsonBody } from "@/lib/template-input";
import {
  VERSION_NAME_TAKEN,
  parseVersionName,
  parseVersionNotes,
} from "@/lib/deck-version-input";

type Ctx = { params: Promise<{ id: string }> };

/** GET — every version of the deck, oldest first, with card counts and game records. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  return NextResponse.json({ versions: await loadVersionSummaries(id) });
}

/**
 * POST { name, notes?, fromVersionId? } — create a version as a copy of another.
 *
 * `fromVersionId` defaults to the current version and must belong to this deck.
 * Card rows are copied, so the two versions diverge from here. Annotations,
 * role overrides, themes and templates are deck-level and shared, so there is
 * nothing of theirs to copy. The new version does not become current.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  const body = await readJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  const name = parseVersionName(body.value.name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: name.status });

  const notes = parseVersionNotes(body.value.notes);
  if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: notes.status });

  const from = body.value.fromVersionId;
  if (from !== undefined && from !== null && typeof from !== "string") {
    return NextResponse.json({ error: "fromVersionId must be a string" }, { status: 400 });
  }
  const sourceId = await resolveVersionId(id, from ?? null);
  if (!sourceId) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  try {
    const version = await prisma.$transaction(async (tx) => {
      const created = await tx.deckVersion.create({
        data: { deckId: id, name: name.value, notes: notes.value, parentVersionId: sourceId },
      });

      const sourceCards = await tx.deckCard.findMany({
        where: { versionId: sourceId },
        select: { cardId: true, quantity: true, isCommander: true, slot: true },
      });
      if (sourceCards.length > 0) {
        await tx.deckCard.createMany({
          data: sourceCards.map((card) => ({ ...card, versionId: created.id })),
        });
      }

      return created;
    });

    return NextResponse.json({ id: version.id }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, "name")) {
      return NextResponse.json({ error: VERSION_NAME_TAKEN }, { status: 409 });
    }
    throw error;
  }
}
