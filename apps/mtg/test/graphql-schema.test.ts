/**
 * Guards on the schema's shape and on the one mistake the RLS design cannot
 * catch at runtime.
 *
 * No database: the schema is built from the Pothos builder, which reaches the
 * database only inside resolvers.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  GraphQLNonNull,
  GraphQLObjectType,
  lexicographicSortSchema,
  printSchema,
  type GraphQLField,
} from "graphql";
import { schema } from "@/lib/graphql/schema";

const GRAPHQL_LIB = join(import.meta.dirname, "../src/lib/graphql");

function queryField(name: string): GraphQLField<unknown, unknown> {
  const field = schema.getQueryType()?.getFields()[name];
  assert.ok(field, `Query.${name} should exist`);
  return field;
}

function objectField(typeName: string, fieldName: string): GraphQLField<unknown, unknown> {
  const type = schema.getType(typeName);
  assert.ok(type instanceof GraphQLObjectType, `${typeName} should be an object type`);
  const field = type.getFields()[fieldName];
  assert.ok(field, `${typeName}.${fieldName} should exist`);
  return field;
}

test("columns that are NOT NULL are non-null in the schema", () => {
  // Pothos defaults fields to nullable; builder.ts turns that off. If that
  // setting is ever lost, every generated client type silently gains a `| null`
  // and this is the test that notices.
  for (const [typeName, fieldName] of [
    ["Deck", "name"],
    ["Card", "name"],
    ["Card", "cmc"],
    ["DeckVersion", "mainCount"],
    ["DeckCard", "quantity"],
  ] as const) {
    assert.ok(
      objectField(typeName, fieldName).type instanceof GraphQLNonNull,
      `${typeName}.${fieldName} should be non-null`
    );
  }
});

test("a column that is nullable in Postgres stays nullable in the schema", () => {
  assert.ok(!(objectField("Deck", "description").type instanceof GraphQLNonNull));
  assert.ok(!(objectField("Card", "manaCost").type instanceof GraphQLNonNull));
});

test("single-row lookups are nullable, because a hidden row must look like a missing one", () => {
  // RLS makes somebody else's deck absent rather than forbidden, and that is
  // the same 404-not-403 rule src/lib/ownership.ts follows: a distinguishable
  // "forbidden" would confirm the id is real.
  for (const name of ["deck", "version", "card"]) {
    assert.ok(
      !(queryField(name).type instanceof GraphQLNonNull),
      `Query.${name} must be nullable`
    );
  }
});

test("collections are non-null lists — signed out means empty, never null", () => {
  assert.ok(queryField("decks").type instanceof GraphQLNonNull);
  assert.ok(queryField("cards").type instanceof GraphQLNonNull);
});

test("the mutation surface is deliberately small", () => {
  const mutations = Object.keys(schema.getMutationType()?.getFields() ?? {});

  // Branching, promoting and card edits stay in REST, where their transactional
  // invariants already live. Growing this list is a decision, not a detail —
  // see docs/plans/graphql-endpoint.md.
  assert.deepEqual(mutations, ["renameDeck"]);
});

test("no subscriptions", () => {
  assert.equal(schema.getSubscriptionType(), undefined);
});

test("the DateTime scalar serialises to an ISO-8601 string", () => {
  const scalar = schema.getType("DateTime");
  assert.ok(scalar && "serialize" in scalar);

  const serialize = scalar.serialize as (value: unknown) => unknown;
  assert.equal(serialize(new Date("2026-09-16T12:34:56.000Z")), "2026-09-16T12:34:56.000Z");
});

test("no resolver reaches the database outside the RLS transaction", () => {
  // The single failure this design cannot detect at runtime: a resolver that
  // imports the module-level Prisma singleton runs as the privileged role with
  // RLS switched off, and returns every account's rows without erroring.
  // rls.ts is the one file allowed to import it — it is what opens the
  // transaction that downgrades the connection.
  const offenders = readdirSync(GRAPHQL_LIB)
    .filter((file) => file.endsWith(".ts") && file !== "rls.ts")
    .filter((file) => readFileSync(join(GRAPHQL_LIB, file), "utf8").includes('from "@/lib/prisma"'));

  assert.deepEqual(
    offenders,
    [],
    `these must take the transaction from context instead of importing the Prisma singleton: ${offenders.join(", ")}`
  );
});

test("the committed SDL is in sync with the builder", () => {
  // graphql/schema.graphql is what codegen reads to type the client, so a stale
  // one means the generated types describe a schema the server no longer serves.
  const committed = readFileSync(join(import.meta.dirname, "../graphql/schema.graphql"), "utf8");

  assert.equal(
    committed.trim(),
    printSchema(lexicographicSortSchema(schema)).trim(),
    "graphql/schema.graphql is stale — run `pnpm --filter @mtg/deck-builder graphql:schema` (then graphql:types)"
  );
});
