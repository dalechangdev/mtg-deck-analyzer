import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer for identity.
 *
 * Every Prisma query against user-owned data must be scoped by the id this
 * returns. That is not a style preference: Prisma connects to Supabase as a
 * privileged role, so Row Level Security does not filter its queries. RLS
 * guards the Data API (anon key, browser); these functions guard Prisma. A
 * query that forgets the userId filter reads every account's rows and no
 * error will be raised.
 *
 * Wrapped in React's cache() so repeated calls within one render pass hit
 * Supabase once.
 */

/** The signed-in user's id, or null. Use for pages that render either way. */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();

  // getClaims() verifies the JWT signature. getSession() would return whatever
  // is in the cookie without validating it, which is not a safe basis for an
  // ownership check.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  return data.claims.sub;
});

/**
 * The signed-in user's id, or a redirect to /login. Use in every route that
 * touches decks, library, cart or private templates.
 */
export const requireUserId = cache(async (): Promise<string> => {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return userId;
});

/**
 * Same as requireUserId but for Route Handlers, where a redirect is the wrong
 * answer — an API caller wants a 401, not an HTML login page.
 */
export async function requireUserIdOr401(): Promise<
  { userId: string; response?: never } | { userId?: never; response: Response }
> {
  const userId = await getUserId();
  if (!userId) {
    return {
      response: Response.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  return { userId };
}
