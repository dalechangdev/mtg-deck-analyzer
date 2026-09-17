import { GraphQLError } from "graphql";
import { builder } from "./builder";
import { CardType } from "./card";
import type { DeckCardRow, DeckRow, GameRecord, VersionRow } from "./loaders";

/**
 * The deck half of the schema.
 *
 * NOTHING HERE FILTERS BY USER ID, and that is the design rather than an
 * oversight. Every query runs inside the RLS-scoped transaction opened in
 * rls.ts, so "Own decks", "Versions of own decks" and "Cards in own decks" are
 * what decide visibility. A resolver that added `where: { userId }` would be
 * duplicating a policy that is already enforced one layer down — and would
 * quietly become the only check if the policy ever changed.
 *
 * The consequence to keep in mind: a deck belonging to someone else is not
 * forbidden, it is *absent*. `deck(id:)` answers null for a deck that exists
 * but is not yours, which is the same 404-not-403 rule src/lib/ownership.ts
 * follows, for the same reason — a distinguishable "forbidden" confirms the id
 * is real.
 */

export const GameRecordType = builder.objectRef<GameRecord>("GameRecord").implement({
  description: "A version's results. Games with no recorded result count only toward `games`.",
  fields: (t) => ({
    games: t.exposeInt("games"),
    wins: t.exposeInt("wins"),
    losses: t.exposeInt("losses"),
    draws: t.exposeInt("draws"),
  }),
});

export const DeckCardType = builder.objectRef<DeckCardRow>("DeckCard").implement({
  description: "One card in one version of a deck.",
  fields: (t) => ({
    id: t.exposeID("id"),
    quantity: t.exposeInt("quantity"),
    isCommander: t.exposeBoolean("isCommander"),
    slot: t.exposeString("slot", { description: '"main" or "maybe".' }),
    card: t.field({
      type: CardType,
      resolve: async (deckCard, _args, ctx) => {
        const card = await ctx.loaders.cardById.load(deckCard.cardId);
        // DeckCard.cardId is a foreign key to a world-readable table, so a miss
        // here means the catalogue row is genuinely gone, not hidden by RLS.
        if (!card) throw new GraphQLError(`Card ${deckCard.cardId} is missing from the catalogue.`);
        return card;
      },
    }),
  }),
});

export const DeckVersionType = builder.objectRef<VersionRow>("DeckVersion").implement({
  description: "A named variant of a deck. Each version owns a full copy of its card list.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    notes: t.exposeString("notes", { nullable: true }),
    parentVersionId: t.exposeID("parentVersionId", {
      nullable: true,
      description: "Lineage — survives the parent version's deletion.",
    }),
    createdAt: t.field({ type: "DateTime", resolve: (version) => version.createdAt }),
    updatedAt: t.field({ type: "DateTime", resolve: (version) => version.updatedAt }),

    isCurrent: t.boolean({
      description: "Whether the deck opens on this version.",
      resolve: async (version, _args, ctx) => {
        const deck = await ctx.loaders.deckById.load(version.deckId);
        return deck?.currentVersionId === version.id;
      },
    }),

    mainCount: t.int({
      description: "Main-slot card quantity, commander included — the number checked against 100.",
      resolve: (version, _args, ctx) => ctx.loaders.mainCountByVersionId.load(version.id),
    }),

    record: t.field({
      type: GameRecordType,
      resolve: (version, _args, ctx) => ctx.loaders.recordByVersionId.load(version.id),
    }),

    cards: t.field({
      type: [DeckCardType],
      description: "Commander first, then alphabetical — the order every deck view renders.",
      resolve: (version, _args, ctx) => ctx.loaders.cardsByVersionId.load(version.id),
    }),
  }),
});

export const DeckType = builder.objectRef<DeckRow>("Deck").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    createdAt: t.field({ type: "DateTime", resolve: (deck) => deck.createdAt }),
    updatedAt: t.field({ type: "DateTime", resolve: (deck) => deck.updatedAt }),

    versions: t.field({
      type: [DeckVersionType],
      description: "Oldest first.",
      resolve: (deck, _args, ctx) => ctx.loaders.versionsByDeckId.load(deck.id),
    }),

    currentVersion: t.field({
      type: DeckVersionType,
      nullable: true,
      description: "Null only transiently, or if the current version was deleted.",
      resolve: (deck, _args, ctx) =>
        deck.currentVersionId ? ctx.loaders.versionById.load(deck.currentVersionId) : null,
    }),
  }),
});

builder.queryField("decks", (t) =>
  t.field({
    type: [DeckType],
    description: "The signed-in user's decks, most recently updated first. Empty when signed out.",
    resolve: (_parent, _args, ctx) => ctx.db.deck.findMany({ orderBy: { updatedAt: "desc" } }),
  })
);

builder.queryField("deck", (t) =>
  t.field({
    type: DeckType,
    nullable: true,
    description: "Null when the deck does not exist OR is not yours — deliberately the same answer.",
    args: { id: t.arg.id({ required: true }) },
    resolve: (_parent, args, ctx) => ctx.loaders.deckById.load(String(args.id)),
  })
);

builder.queryField("version", (t) =>
  t.field({
    type: DeckVersionType,
    nullable: true,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_parent, args, ctx) => ctx.loaders.versionById.load(String(args.id)),
  })
);

/**
 * The whole write surface, on purpose.
 *
 * The interesting mutations — branching a version, promoting one to current,
 * adding a card — carry transactional invariants and business rules that the
 * REST handlers already enforce (a deck never left without a version, one
 * commander per version, the basic-land exception to singleton). A second entry
 * point into those is risk with no reader asking for it, so GraphQL ships
 * read-first and REST keeps the writes.
 *
 * This one earns its place by demonstrating that writes are policed the same
 * way reads are: `updateMany` against a deck you do not own matches zero rows,
 * because the "Own decks" policy has a USING clause. No ownership check in this
 * resolver — the absence is the point.
 */
builder.mutationField("renameDeck", (t) =>
  t.field({
    type: DeckType,
    nullable: true,
    description: "Null when the deck does not exist or is not yours.",
    args: {
      id: t.arg.id({ required: true }),
      name: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      const name = args.name.trim();
      if (!name) throw new GraphQLError("Name required.");

      const { count } = await ctx.db.deck.updateMany({
        where: { id: String(args.id) },
        data: { name },
      });
      if (count === 0) return null;

      // Read back through the transaction rather than the loader: the loader
      // may already have cached the pre-rename row for this request.
      return ctx.db.deck.findUnique({ where: { id: String(args.id) } });
    },
  })
);
