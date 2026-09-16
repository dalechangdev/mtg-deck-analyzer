/**
 * Sign-in error reporting. Errors are built inline in the shape Supabase's
 * AuthError carries (code, status, name, message), so no network and no
 * Supabase client.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { describeAuthError } from "@/lib/auth-errors";

/** An AuthApiError as @supabase/auth-js constructs it. */
function authError(message: string, status?: number, code?: string) {
  return Object.assign(new Error(message), { name: "AuthApiError", status, code });
}

test("a wrong password never says whether the account exists", () => {
  const result = describeAuthError(
    authError("Invalid login credentials", 400, "invalid_credentials"),
    "sign-in"
  );
  assert.equal(result.message, "Email or password is incorrect.");
  assert.equal(result.tone, "error");
  // The detail is for the developer, not the form's logic.
  assert.match(result.detail ?? "", /invalid_credentials · HTTP 400 · Invalid login credentials/);
  for (const word of ["exist", "found", "unknown", "registered"]) {
    assert.doesNotMatch(result.message, new RegExp(word, "i"));
  }
});

test("rate limiting is named, by code or by status", () => {
  const byCode = describeAuthError(
    authError("Request rate limit reached", 429, "over_request_rate_limit"),
    "sign-in"
  );
  const byStatus = describeAuthError(authError("Too many requests", 429), "sign-in");
  assert.match(byCode.message, /Too many attempts/);
  assert.equal(byStatus.message, byCode.message);
});

test("an unreachable auth service is not reported as bad credentials", () => {
  const retryable = Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError" });
  const thrown = new TypeError("fetch failed");
  const server = authError("Internal Server Error", 503);
  for (const error of [retryable, thrown, server]) {
    const result = describeAuthError(error, "sign-in");
    assert.match(result.message, /Couldn't reach the authentication service/, String(error));
  }
});

test("a missing URL or key reads as configuration, not credentials", () => {
  const result = describeAuthError(new Error("supabaseUrl is required."), "sign-in");
  assert.match(result.message, /isn't configured/);
  assert.match(result.message, /NEXT_PUBLIC_SUPABASE_URL/);
});

test("unconfirmed email and locked accounts say what to do", () => {
  assert.match(
    describeAuthError(authError("Email not confirmed", 400, "email_not_confirmed"), "sign-in").message,
    /needs its email confirmed/
  );
  assert.match(
    describeAuthError(authError("User is banned", 403, "user_banned"), "sign-in").message,
    /locked/
  );
});

test("sign-up: duplicate email and weak password", () => {
  assert.match(
    describeAuthError(authError("User already registered", 422, "user_already_exists"), "sign-up").message,
    /already exists/
  );
  assert.match(
    describeAuthError(authError("Password is too short", 422, "weak_password"), "sign-up").message,
    /too weak/
  );
});

test("validation failures keep Supabase's own wording", () => {
  const result = describeAuthError(
    authError("Unable to validate email address: invalid format", 422, "validation_failed"),
    "sign-up"
  );
  assert.equal(result.message, "Unable to validate email address: invalid format");
});

test("anything unrecognised still carries a detail to debug with", () => {
  const result = describeAuthError(authError("Kaboom", 418, "im_a_teapot"), "sign-in");
  assert.equal(result.message, "Sign-in failed unexpectedly.");
  assert.match(result.detail ?? "", /im_a_teapot · HTTP 418 · Kaboom/);
});

test("a non-object error doesn't crash the mapper", () => {
  const result = describeAuthError("something went wrong", "sign-in");
  assert.equal(result.message, "Sign-in failed unexpectedly.");
  assert.equal(result.detail, "something went wrong");
  assert.equal(describeAuthError(null, "sign-in").detail, undefined);
});
