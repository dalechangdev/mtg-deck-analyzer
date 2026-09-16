/**
 * Turning a Supabase auth failure into something a person can act on.
 *
 * The sign-in form used to answer "Those credentials did not work." for every
 * failure, which is right for a wrong password and wrong for everything else:
 * a rate limit, an unconfirmed account, a misconfigured key and an auth service
 * that isn't running all looked identical.
 *
 * Pure and dependency-free (errors are read structurally, not by class) so it
 * can be unit tested with plain objects.
 */

export type AuthMessage = {
  /** Shown to the user. Never says whether an account exists. */
  message: string;
  /** Error code, status and original text. The login page shows it outside production. */
  detail?: string;
  tone: "error" | "info";
};

type AuthErrorish = {
  code?: unknown;
  status?: unknown;
  name?: unknown;
  message?: unknown;
};

function read(error: unknown): { code?: string; status?: number; name?: string; message?: string } {
  if (typeof error !== "object" || error === null) {
    return { message: typeof error === "string" ? error : undefined };
  }
  const e = error as AuthErrorish;
  return {
    code: typeof e.code === "string" ? e.code : undefined,
    status: typeof e.status === "number" ? e.status : undefined,
    name: typeof e.name === "string" ? e.name : undefined,
    message: typeof e.message === "string" ? e.message : undefined,
  };
}

/** `code · status · original message` — enough to search the Supabase docs or the auth log. */
function detailOf(error: unknown): string | undefined {
  const { code, status, name, message } = read(error);
  const parts = [code ?? name, status !== undefined ? `HTTP ${status}` : undefined, message];
  const detail = parts.filter(Boolean).join(" · ");
  return detail || undefined;
}

/** The auth service is unreachable, rather than refusing the credentials. */
function isUnreachable(error: unknown): boolean {
  const { name, status, message } = read(error);
  if (name === "AuthRetryableFetchError") return true;
  if (status !== undefined && status >= 500) return true;
  return status === undefined && /fetch failed|network|ECONNREFUSED|socket hang up/i.test(message ?? "");
}

/** The client was built without a URL or key — a config problem, not a credentials one. */
function isMisconfigured(error: unknown): boolean {
  return /supabaseUrl is required|supabaseKey is required|Invalid API key/i.test(read(error).message ?? "");
}

/**
 * What to tell someone whose sign-in or sign-up just failed.
 *
 * "Email or password is incorrect" stays deliberately ambiguous between an
 * unknown email and a wrong password: saying which would let anyone use the
 * form to test whether an address has an account here. Every other case is
 * safe to name, and naming it is the difference between fixing the problem and
 * guessing at it.
 */
export function describeAuthError(error: unknown, action: "sign-in" | "sign-up"): AuthMessage {
  const { code, status } = read(error);
  const detail = detailOf(error);
  const fail = (message: string): AuthMessage => ({ message, detail, tone: "error" });

  if (isMisconfigured(error)) {
    return fail(
      "Sign-in isn't configured on this server: check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  if (isUnreachable(error)) {
    return fail("Couldn't reach the authentication service. Is Supabase running?");
  }

  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429) {
    return fail("Too many attempts. Wait about a minute, then try again.");
  }

  if (code === "user_banned") return fail("That account is locked.");

  if (code === "email_not_confirmed") {
    return fail("That account still needs its email confirmed. Open the confirmation link, then sign in.");
  }

  if (code === "email_exists" || code === "user_already_exists") {
    return fail("An account with that email already exists — sign in instead.");
  }

  if (code === "weak_password") {
    return fail("That password is too weak. Use a longer one.");
  }

  if (code === "validation_failed" || code === "bad_json" || status === 422) {
    // Supabase's own text here is about the input ("Unable to validate email address"),
    // so it's more useful than anything generic.
    return fail(read(error).message || "That email or password isn't in a valid format.");
  }

  if (code === "invalid_credentials" || status === 400) {
    return fail(
      action === "sign-in"
        ? "Email or password is incorrect."
        : "That email or password was rejected."
    );
  }

  return fail(
    action === "sign-in" ? "Sign-in failed unexpectedly." : "Creating the account failed unexpectedly."
  );
}
