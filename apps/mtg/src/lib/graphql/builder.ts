import SchemaBuilder from "@pothos/core";
import type { Loaders } from "./loaders";
import type { RlsClient, Viewer } from "./rls";

/**
 * The Pothos schema builder, and the context every resolver receives.
 *
 * `GraphQLContext` is a type alias rather than an interface on purpose: Yoga's
 * server-context parameter is constrained to `Record<string, any>`, and only
 * object type aliases pick up the implicit index signature that satisfies it.
 *
 * `db` is the RLS-scoped transaction opened by the route handler, NOT the
 * module-level Prisma singleton. Importing `@/lib/prisma` inside a resolver
 * would run the query as the privileged role with RLS switched off — the one
 * mistake this design cannot detect at runtime, so test/graphql-schema.test.ts
 * checks for it statically.
 */
export type GraphQLContext = {
  db: RlsClient;
  loaders: Loaders;
  viewer: Viewer;
};

/**
 * `DefaultFieldNullability: false` is set explicitly rather than left to the
 * default. Pothos builds fields nullable unless told otherwise, which would put
 * a `?` on every property of every generated client type — `deck.name` typed
 * `string | null` when the column is NOT NULL. Non-null is the truth here, and
 * the generated types are only worth having if they carry it.
 */
export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  DefaultFieldNullability: false;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
  };
}>({
  defaultFieldNullability: false,
});

/**
 * Timestamps cross the wire as ISO-8601, matching what the REST handlers
 * already serialise (`VersionSummary.createdAt` and friends are strings).
 */
builder.scalarType("DateTime", {
  description: "An ISO-8601 date-time string.",
  serialize: (value) => value.toISOString(),
  parseValue: (value) => {
    if (typeof value !== "string") {
      throw new TypeError("DateTime must be an ISO-8601 string.");
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError(`Not a valid DateTime: ${value}`);
    }
    return parsed;
  },
});

builder.queryType({});
builder.mutationType({});
