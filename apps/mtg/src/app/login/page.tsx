"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "./actions";

// Inlined at build time. The detail line names the Supabase error code and
// status, which helps while developing and says too much in production.
const SHOW_DETAIL = process.env.NODE_ENV !== "production";

export default function LoginPage() {
  const [signInResult, signInAction, signingIn] = useActionState(signIn, null);
  const [signUpResult, signUpAction, signingUp] = useActionState(signUp, null);
  const result = signInResult ?? signUpResult;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-[var(--gutter-x)] py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
        <p className="text-ui text-muted-foreground">
          Your decks, collection and cart are tied to your account.
        </p>
      </div>

      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {result ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-1">
            <p className={result.tone === "error" ? "text-ui text-destructive" : "text-ui text-foreground"}>
              {result.message}
            </p>
            {SHOW_DETAIL && result.detail ? (
              <p className="font-mono text-label break-words text-muted-foreground">{result.detail}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" formAction={signInAction} disabled={signingIn || signingUp}>
            {signingIn ? "Signing in…" : "Sign in"}
          </Button>
          <Button
            type="submit"
            variant="outline"
            formAction={signUpAction}
            disabled={signingIn || signingUp}
          >
            {signingUp ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
    </div>
  );
}
