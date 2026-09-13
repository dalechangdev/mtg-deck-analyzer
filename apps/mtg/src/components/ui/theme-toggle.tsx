"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY, applyTheme, readTheme } from "@/lib/theme";

/**
 * Both icons are always rendered and swapped with the `dark:` variant, so the
 * server and client markup match exactly — no hydration mismatch, no flash,
 * and no need to track the theme in React state.
 */
export function ThemeToggle() {
  function toggle() {
    const next = readTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — the theme still applies for
      // this page view, it just won't be remembered.
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label="Toggle color theme"
      title="Toggle color theme"
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
