import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserIdOr401 } from "@/lib/auth";
import { parseNote } from "@/lib/saved-commander-input";

type Params = { params: Promise<{ id: string }> };

/** Edit the note. Someone else's entry answers 404, the same as a missing one. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const note = parseNote(body?.note);
  if (note === false || note === undefined) {
    return NextResponse.json({ error: "Invalid note" }, { status: 400 });
  }

  const { count } = await prisma.savedCommander.updateMany({
    where: { id, userId: auth.userId },
    data: { note },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id, note });
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { id } = await params;
  await prisma.savedCommander.deleteMany({ where: { id, userId: auth.userId } });
  return new NextResponse(null, { status: 204 });
}
