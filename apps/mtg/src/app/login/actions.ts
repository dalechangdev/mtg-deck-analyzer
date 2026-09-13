"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Email + password auth. Server Actions rather than route handlers so the
 * cookies Supabase sets during sign-in are written on a request that is
 * allowed to write them — a Server Component is not.
 */

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signIn(_prev: string | null, formData: FormData) {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return "Email and password are both required.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Deliberately vague: distinguishing "no such account" from "wrong password"
  // turns the login form into an account-enumeration oracle.
  if (error) return "Those credentials did not work.";

  revalidatePath("/", "layout");
  redirect("/decks");
}

export async function signUp(_prev: string | null, formData: FormData) {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return "Email and password are both required.";
  if (password.length < 8) return "Use at least 8 characters.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return error.message;

  // With email confirmation enabled the session does not exist yet — the user
  // lands here again via /auth/callback after clicking the link.
  return "Check your email to confirm the account.";
}
