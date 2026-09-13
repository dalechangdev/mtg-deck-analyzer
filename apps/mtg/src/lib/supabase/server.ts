import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Must be created per request — the cookie store is request-scoped, so a shared
 * module-level client would serve one user's session to everybody.
 *
 * This client is used for AUTH ONLY in this app. Data access goes through
 * Prisma (src/lib/prisma.ts), which connects as a privileged role that RLS
 * does not constrain — see prisma/migrations/*_add_ownership_and_rls.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Safe to ignore as long as
            // proxy.ts is refreshing the session on every request.
          }
        },
      },
    }
  );
}
