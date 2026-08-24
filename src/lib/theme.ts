export const THEME_STORAGE_KEY = "mtg-theme";

export type Theme = "light" | "dark";

/**
 * Applies a theme to <html>. Kept in one place so the inline boot script
 * below and the toggle can't drift apart.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Runs before first paint to prevent a flash of the wrong theme. Inlined into
 * <head> as a plain <script> — next/script can't guarantee it runs pre-paint.
 *
 * Defaults to dark when nothing is stored, rather than following
 * prefers-color-scheme: most components still hardcode dark-tuned palette
 * colors, so light mode is opt-in until those are converted to the status
 * ramps in globals.css. Swap the fallback once that migration lands.
 */
export const THEME_BOOT_SCRIPT = `
(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="light"?"light":"dark";
var r=document.documentElement;
r.classList.toggle("dark",t==="dark");
r.style.colorScheme=t;
}catch(e){}})();
`.replace(/\n/g, "");
