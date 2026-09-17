import { createYoga } from "graphql-yoga";
import type { NextRequest } from "next/server";
import { createLoaders } from "@/lib/graphql/loaders";
import { runWithRls } from "@/lib/graphql/rls";
import { getViewer } from "@/lib/graphql/viewer";
import { schema } from "@/lib/graphql/schema";
import type { GraphQLContext } from "@/lib/graphql/builder";

/**
 * POST /api/graphql — one endpoint, alongside REST rather than replacing it.
 *
 * WHY THE TRANSACTION WRAPS THE HANDLER RATHER THAN LIVING IN A CONTEXT FACTORY
 * ----------------------------------------------------------------------------
 * RLS settings are transaction-scoped, so the transaction has to stay open for
 * the whole of execution and close after the response is built. Yoga's `context`
 * option cannot express that — it returns a value and then returns control.
 *
 * Passing the open transaction as Yoga's *server context* does: `handleRequest`
 * takes it as its second argument, Yoga merges it into the GraphQL context, and
 * the transaction's lifetime is exactly the request's. Which is also what the
 * serverless constraint wants — nothing here is scoped to the process.
 */
const { handleRequest } = createYoga<GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  // Next's Response, so Yoga builds a response object this runtime understands.
  fetchAPI: { Response },
  // Resolver errors are masked in production; GraphQLErrors we throw on purpose
  // (a blank deck name, a missing catalogue row) still reach the client.
  maskedErrors: process.env.NODE_ENV === "production",
  graphiql: process.env.NODE_ENV !== "production" ? { title: "MTG deck builder" } : false,
  landingPage: false,
});

async function handle(request: NextRequest): Promise<Response> {
  const viewer = await getViewer();

  // A GET for the GraphiQL page also opens a transaction it does not use. Two
  // set_config calls and a SELECT is a cheap enough price for having exactly one
  // path in and out of here, and GraphiQL is off in production anyway.
  return runWithRls(viewer, async (db) =>
    handleRequest(request, { db, loaders: createLoaders(db), viewer })
  );
}

export { handle as GET, handle as POST, handle as OPTIONS };
