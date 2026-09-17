import type { TypedDocumentString } from "@/generated/graphql/graphql";

/**
 * The browser's way into /api/graphql.
 *
 * The only thing worth noting is what is absent: a response type. `document`
 * carries its own result type, generated from the schema, so `TData` is
 * inferred and there is nowhere to write a response shape by hand — which is
 * the whole point of generating them.
 *
 *   const { decks } = await graphqlRequest(DeckListDocument);
 *   //      ^? { id: string; name: string; currentVersion: … | null }[]
 *
 * Credentials ride on the session cookie, same as every fetch the client
 * already makes to /api/*. The endpoint also accepts `Authorization: Bearer`
 * for non-browser callers (see viewer.ts), which is not something the browser
 * needs or should do.
 */

const ENDPOINT = "/api/graphql";

/** A GraphQL request that failed — transport, or errors in the response body. */
export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    readonly errors: readonly { message: string }[] = []
  ) {
    super(message);
    this.name = "GraphQLRequestError";
  }
}

export async function graphqlRequest<TData, TVariables>(
  document: TypedDocumentString<TData, TVariables>,
  variables?: TVariables,
  init?: Pick<RequestInit, "signal">
): Promise<TData> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/graphql-response+json, application/json",
    },
    body: JSON.stringify({ query: document.toString(), variables }),
    signal: init?.signal,
  });

  // A GraphQL server answers 200 with an `errors` array for a resolver failure,
  // so the status alone does not say whether this worked.
  if (!response.ok && response.status !== 400) {
    throw new GraphQLRequestError(`GraphQL request failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: TData;
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    throw new GraphQLRequestError(body.errors[0].message, body.errors);
  }
  if (!body.data) {
    throw new GraphQLRequestError("GraphQL response contained no data.");
  }

  return body.data;
}
