import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the email confirmation / password recovery links land. Supabase sends
 * a one-time `code`; exchanging it is what actually creates the session
 * cookies, so this must be a Route Handler (Server Components cannot write
 * cookies).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/decks";

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Only ever redirect to a path on this origin. Echoing an absolute URL back
  // from a query parameter is an open redirect.
  const target = next.startsWith("/") ? next : "/decks";
  return NextResponse.redirect(`${origin}${target}`);
}
