import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "./rls";

/**
 * Who is asking?
 *
 * Kept apart from rls.ts on purpose. rls.ts is about scoping a database
 * connection and nothing else, so it stays free of `next/headers` — which is
 * what lets scripts/verify-graphql-rls.ts exercise the authorisation boundary
 * outside a request.
 *
 * Identity comes from getClaims(), which verifies the JWT signature. This is
 * the same choice src/lib/auth.ts makes and for the same reason: getSession()
 * returns whatever is in the cookie without validating it, and an unvalidated
 * claim is the last thing to hand a database as an authorisation decision.
 */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();

  // Browsers authenticate with the session cookie. A script or a server-to-
  // server caller may send `Authorization: Bearer <jwt>` instead — getClaims()
  // verifies the signature either way, so a token is never trusted merely
  // because it parsed.
  const authorization = (await headers()).get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  const { data, error } = await supabase.auth.getClaims(bearer);
  if (error || !data?.claims?.sub) return null;

  return {
    userId: data.claims.sub,
    claims: data.claims as unknown as Record<string, unknown>,
  };
}
