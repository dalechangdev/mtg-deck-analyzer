import "dotenv/config";
import { graphql, type ExecutionResult } from "graphql";
import { prisma } from "../src/lib/prisma";
import { createLoaders } from "../src/lib/graphql/loaders";
import { runWithRls, type Viewer } from "../src/lib/graphql/rls";
import { schema } from "../src/lib/graphql/schema";

/**
 * Proves the authorisation boundary against a real database.
 *
 * The property under test is the one that cannot be unit-tested: that the RLS
 * policies, not the resolvers, decide what a GraphQL query returns. So this
 * runs the actual schema against actual rows as three different callers and
 * checks who sees what.
 *
 * It bypasses Next rather than driving the HTTP route because everything
 * interesting lives below Yoga — the transaction, the role downgrade, the
 * policies. `getViewer()` is the only piece skipped, and it does nothing but
 * turn a verified JWT into the Viewer this constructs by hand.
 *
 *   pnpm --filter @mtg/deck-builder verify:graphql
 *
 * Point DATABASE_URL at a local database first; the guard below refuses to run
 * anywhere else.
 */

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/(127\.0\.0\.1|localhost)/.test(databaseUrl)) {
  console.error(
    "Refusing to run: DATABASE_URL is not a local database.\n" +
      "This script reads and writes real rows. Run it against `supabase start`:\n\n" +
      '  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \\\n' +
      "    pnpm --filter @mtg/deck-builder verify:graphql\n"
  );
  process.exit(1);
}

const viewerFor = (userId: string, email: string): Viewer => ({
  userId,
  claims: { sub: userId, email, role: "authenticated", aud: "authenticated" },
});

async function run(viewer: Viewer, source: string, variableValues?: Record<string, unknown>) {
  return runWithRls(viewer, async (db) =>
    graphql({
      schema,
      source,
      contextValue: { db, loaders: createLoaders(db), viewer },
      variableValues,
    })
  );
}

/** Statements touching the app's tables, so `set_config` and auth.uid() don't count. */
const APP_TABLES = /"(Deck|DeckVersion|DeckCard|Card|CardPrinting|CardFace|LibraryCard|GameLog)"/
  .source;

async function countStatements<T>(fn: () => Promise<T>): Promise<{ result: T; statements: number }> {
  await prisma.$queryRawUnsafe("SELECT pg_stat_statements_reset()");
  const result = await fn();
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT coalesce(sum(calls), 0)::bigint AS n FROM pg_stat_statements WHERE query ~ $1`,
    APP_TABLES
  );
  return { result, statements: Number(rows[0].n) };
}

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${label}` +
      (ok ? `  → ${JSON.stringify(actual)}` : `\n          expected ${JSON.stringify(expected)}\n          actual   ${JSON.stringify(actual)}`)
  );
}

function data<T>(result: ExecutionResult): T {
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
  return result.data as T;
}

const DALE = viewerFor("70c7bdb1-f48a-46e9-b243-e8ab6ffe4ad0", "dale@dalechang.dev");
const BOB = viewerFor("22222222-2222-2222-2222-222222222222", "bob@example.com");

async function main() {
  const decksOf = async (viewer: Viewer) =>
    data<{ decks: { id: string; name: string }[] }>(
      await run(viewer, `{ decks { id name } }`)
    ).decks;

  console.log("\nRLS decides what each caller sees\n");

  const anonDecks = await decksOf(null);
  check("signed out sees no decks", anonDecks.length, 0);

  const anonCards = data<{ cards: { name: string }[] }>(
    await run(null, `{ cards(limit: 2) { name } }`)
  ).cards;
  check("signed out still reads the public catalogue", anonCards.length, 2);

  const daleDecks = await decksOf(DALE);
  const bobDecks = await decksOf(BOB);
  check("dale sees only his own decks", daleDecks.length, 4);
  check("bob sees only his own deck", bobDecks.map((d) => d.name), ["Bob Landfall"]);
  check(
    "their decks do not overlap",
    daleDecks.some((d) => bobDecks.some((b) => b.id === d.id)),
    false
  );

  console.log("\nA deck you do not own is absent, not forbidden\n");

  const bobsDeckId = bobDecks[0].id;
  const foreign = await run(DALE, `query ($id: ID!) { deck(id: $id) { id name } }`, {
    id: bobsDeckId,
  });
  check("dale asking for bob's deck gets null", data<{ deck: unknown }>(foreign).deck, null);
  check("and no error that would confirm the id exists", foreign.errors, undefined);

  const own = data<{ deck: { name: string } | null }>(
    await run(DALE, `query ($id: ID!) { deck(id: $id) { name } }`, { id: daleDecks[0].id })
  );
  check("dale asking for his own deck gets it", own.deck?.name, daleDecks[0].name);

  console.log("\nWrites are policed by the same policies\n");

  const before = await prisma.deck.findUnique({ where: { id: bobsDeckId } });
  const attack = data<{ renameDeck: unknown }>(
    await run(DALE, `mutation ($id: ID!) { renameDeck(id: $id, name: "pwned") { id name } }`, {
      id: bobsDeckId,
    })
  );
  const after = await prisma.deck.findUnique({ where: { id: bobsDeckId } });
  check("dale renaming bob's deck returns null", attack.renameDeck, null);
  check("and bob's deck is untouched", after?.name, before?.name);

  const renamed = data<{ renameDeck: { name: string } | null }>(
    await run(BOB, `mutation ($id: ID!, $n: String!) { renameDeck(id: $id, name: $n) { name } }`, {
      id: bobsDeckId,
      n: `${before?.name}`,
    })
  );
  check("bob renaming his own deck succeeds", renamed.renameDeck?.name, before?.name);

  console.log("\nN+1: query count tracks depth, not row count\n");

  const shallow = await countStatements(() => run(DALE, `{ decks { id name } }`));
  const deep = await countStatements(() =>
    run(DALE, `{ decks { name versions { name mainCount record { games } cards { quantity card { name imageUrl } } } } }`)
  );

  const deepData = data<{
    decks: { versions: { cards: unknown[] }[] }[];
  }>(deep.result);
  const rows = deepData.decks.reduce(
    (total, deck) => total + deck.versions.reduce((n, v) => n + v.cards.length, 0),
    0
  );

  console.log(`  decks only            → ${shallow.statements} statements`);
  console.log(`  decks→versions→cards→card, ${rows} deck cards → ${deep.statements} statements`);
  check("the deep query stays in single digits", deep.statements < 10, true);

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
