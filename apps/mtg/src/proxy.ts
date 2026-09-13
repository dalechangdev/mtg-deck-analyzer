import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh on every request.
 *
 * Next 16 renamed `middleware` to `proxy` (the named export must be `proxy`
 * too), and the proxy runtime is always Node — the edge runtime is not
 * supported here.
 *
 * Server Components cannot write cookies, so without this the refreshed token
 * would be discarded and users would be signed out when their access token
 * expired.
 *
 * This is deliberately NOT where access is decided. Proxy runs on every
 * request including prefetches, so it only touches the cookie; the actual
 * "who is this and may they have it" question is answered next to the data,
 * in src/lib/auth.ts.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getClaims() validates the token rather than trusting the cookie's contents.
  // Do not remove: this call is what actually triggers the refresh.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
