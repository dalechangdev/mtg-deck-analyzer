import { toImageUrl, toLargeImageUrl } from "@/lib/card-detail";
import { builder } from "./builder";
import type { CardRow, FaceRow, PrintingRow } from "./loaders";

/**
 * The card half of the schema.
 *
 * Card data is world-readable (the "Card is public" policy covers anon), so
 * everything here resolves signed out too — the card browser is the SEO
 * surface and has to render for anonymous visitors.
 *
 * `imageUrl` is the reason this schema exists rather than pg_graphql's. The
 * image lives in three places depending on the card — the newest printing's
 * JSON blob, or the first face, or nowhere — and `toImageUrl` already encodes
 * that precedence for the REST loaders. Exposing it as a field means the client
 * never reimplements the fallback.
 */

type ImageUris = { small?: string; normal?: string; large?: string; png?: string };

export const CardPrintingType = builder.objectRef<PrintingRow>("CardPrinting").implement({
  description: "One Scryfall printing of a card — the same card in a particular set.",
  fields: (t) => ({
    id: t.exposeID("id"),
    setCode: t.exposeString("setCode"),
    setName: t.exposeString("setName"),
    rarity: t.exposeString("rarity"),
    collectorNumber: t.exposeString("collectorNumber"),
    scryfallUri: t.exposeString("scryfallUri", { nullable: true }),
    imageUrl: t.string({
      nullable: true,
      resolve: (printing) => {
        const uris = printing.imageUris as ImageUris | null;
        return uris?.normal ?? uris?.small ?? null;
      },
    }),
  }),
});

export const CardFaceType = builder.objectRef<FaceRow>("CardFace").implement({
  description: "One face of a double-faced, split, adventure or modal card.",
  fields: (t) => ({
    name: t.exposeString("name"),
    manaCost: t.exposeString("manaCost", { nullable: true }),
    typeLine: t.exposeString("typeLine"),
    oracleText: t.exposeString("oracleText", { nullable: true }),
    power: t.exposeString("power", { nullable: true }),
    toughness: t.exposeString("toughness", { nullable: true }),
    loyalty: t.exposeString("loyalty", { nullable: true }),
    imageUrl: t.exposeString("imageUri", { nullable: true }),
  }),
});

export const CardType = builder.objectRef<CardRow>("Card").implement({
  description: "A card's canonical identity — one per Scryfall oracle_id.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    manaCost: t.exposeString("manaCost", { nullable: true }),
    cmc: t.exposeFloat("cmc"),
    typeLine: t.exposeString("typeLine"),
    oracleText: t.exposeString("oracleText", { nullable: true }),
    colors: t.exposeStringList("colors"),
    colorIdentity: t.exposeStringList("colorIdentity", {
      description: "WUBRG subset — the Commander legality axis.",
    }),
    keywords: t.exposeStringList("keywords"),
    producedMana: t.exposeStringList("producedMana", {
      description: "Symbols this card can add. Empty also means 'not yet synced'.",
    }),
    layout: t.exposeString("layout", { nullable: true }),
    power: t.exposeString("power", { nullable: true }),
    toughness: t.exposeString("toughness", { nullable: true }),
    loyalty: t.exposeString("loyalty", { nullable: true }),
    isCommanderLegal: t.exposeBoolean("isCommanderLegal"),
    canBeCommander: t.exposeBoolean("canBeCommander"),

    printings: t.field({
      type: [CardPrintingType],
      description: "Newest set first.",
      resolve: (card, _args, ctx) => ctx.loaders.printingsByCardId.load(card.id),
    }),

    faces: t.field({
      type: [CardFaceType],
      resolve: (card, _args, ctx) => ctx.loaders.facesByCardId.load(card.id),
    }),

    imageUrl: t.string({
      nullable: true,
      description: "Newest printing's normal art, falling back to the first face.",
      resolve: async (card, _args, ctx) => {
        const [printings, faces] = await Promise.all([
          ctx.loaders.printingsByCardId.load(card.id),
          ctx.loaders.facesByCardId.load(card.id),
        ]);
        return toImageUrl(printings, faces);
      },
    }),

    largeImageUrl: t.string({
      nullable: true,
      resolve: async (card, _args, ctx) => {
        const [printings, faces] = await Promise.all([
          ctx.loaders.printingsByCardId.load(card.id),
          ctx.loaders.facesByCardId.load(card.id),
        ]);
        return toLargeImageUrl(printings, faces);
      },
    }),

    ownedQuantity: t.int({
      description:
        "How many the signed-in user owns. 0 when signed out — RLS returns no library rows to anon.",
      resolve: (card, _args, ctx) => ctx.loaders.libraryQuantityByCardId.load(card.id),
    }),
  }),
});

builder.queryField("card", (t) =>
  t.field({
    type: CardType,
    nullable: true,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_parent, args, ctx) => ctx.loaders.cardById.load(String(args.id)),
  })
);

/**
 * Deliberately a name-prefix lookup and nothing more.
 *
 * The real search vocabulary — colour comparators, numeric casts of the text
 * power/toughness columns, rarity ranking — lives in src/lib/card-search-sql.ts
 * behind /api/cards, and reproducing it as GraphQL arguments is a project of
 * its own. This field covers the "find a card by name" case the deck builder
 * actually asks for; anything richer should reuse `buildCardWhere` rather than
 * grow a second dialect here.
 */
const MAX_CARDS_PER_PAGE = 100;

builder.queryField("cards", (t) =>
  t.field({
    type: [CardType],
    args: {
      name: t.arg.string(),
      commanderLegal: t.arg.boolean(),
      limit: t.arg.int(),
      offset: t.arg.int(),
    },
    resolve: (_parent, args, ctx) =>
      ctx.db.card.findMany({
        where: {
          ...(args.name ? { name: { contains: args.name, mode: "insensitive" } } : {}),
          ...(args.commanderLegal ? { isCommanderLegal: true } : {}),
        },
        orderBy: { name: "asc" },
        take: Math.min(args.limit ?? 20, MAX_CARDS_PER_PAGE),
        skip: Math.max(args.offset ?? 0, 0),
      }),
  })
);
