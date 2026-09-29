import type { Prisma } from "@/generated/prisma/client";

// Which templates a signed-in user may touch, as Prisma filters. Prisma runs
// privileged with RLS off, so these ARE the boundary for every REST route and
// page — see "Authorization in apps/mtg" in CLAUDE.md.
//
// There are two questions, and mixing them up is the bug to watch for
// (docs/plans/template-library.md):
//
// - usable:   attach to a deck, score against, pick in /decks/start, list under
//             "My templates". The caller's own templates plus the shared
//             reference ones (ownerId null).
// - viewable: preview and clone. Usable, plus anyone's published template.
//
// Public templates are cloned to use, never used by reference, so widening a
// usable check to viewable would let someone else's edit, unpublish or delete
// reach into the caller's decks.

/** Own templates and shared reference ones — what a deck can be scored against. */
export function usableTemplateWhere(userId: string): Prisma.AnalysisTemplateWhereInput {
  return { OR: [{ ownerId: userId }, { ownerId: null }] };
}

/** Usable, plus every published template — what can be previewed and cloned. */
export function viewableTemplateWhere(userId: string): Prisma.AnalysisTemplateWhereInput {
  return { OR: [{ ownerId: userId }, { ownerId: null }, { isPublic: true }] };
}
