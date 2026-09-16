"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { describeAuthError, type AuthMessage } from "@/lib/auth-errors";

/**
 * Email + password auth. Server Actions rather than route handlers so the
 * cookies Supabase sets during sign-in are written on a request that is
 * allowed to write them — a Server Component is not.
 *
 * Both actions answer with an `AuthMessage` the form renders. Failures are
 * mapped in `src/lib/auth-errors.ts`: the user gets a message that never
 * reveals whether an account exists, while the code, status and original text
 * go to the server log — and, outside production, to the form itself.
 */

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

function fail(error: unknown, action: "sign-in" | "sign-up"): AuthMessage {
  const described = describeAuthError(error, action);
  // The one place the real cause is always recorded, whatever the form shows.
  console.error(`[auth] ${action} failed: ${described.detail ?? "no detail"}`);
  return described;
}

const missingField = (message: string): AuthMessage => ({ message, tone: "error" });

export async function signIn(_prev: AuthMessage | null, formData: FormData): Promise<AuthMessage | null> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return missingField("Email and password are both required.");

  // Creating the client throws when the URL or key is missing, and the call
  // itself throws when Supabase is unreachable — both look like a failed
  // sign-in to the user, so both are mapped rather than left to crash.
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return fail(error, "sign-in");
  } catch (error) {
    return fail(error, "sign-in");
  }

  // Outside the try: redirect() signals by throwing, and catching it here
  // would turn a successful sign-in into "failed unexpectedly".
  revalidatePath("/", "layout");
  redirect("/decks");
}

export async function signUp(_prev: AuthMessage | null, formData: FormData): Promise<AuthMessage | null> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return missingField("Email and password are both required.");
  if (password.length < 8) return missingField("Use at least 8 characters.");

  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return fail(error, "sign-up");
    // With email confirmation off (the local default) sign-up returns a session
    // and the account is usable immediately; with it on, there is no session
    // until the emailed link is followed.
    signedIn = Boolean(data.session);
  } catch (error) {
    return fail(error, "sign-up");
  }

  if (!signedIn) {
    return { message: "Account created. Check your email to confirm it, then sign in.", tone: "info" };
  }

  revalidatePath("/", "layout");
  redirect("/decks");
}
