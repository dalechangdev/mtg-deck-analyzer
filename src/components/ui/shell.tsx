import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Standard padded page body. Owns the page gutter so it can be retuned from
 * --gutter-x / --gutter-y in globals.css instead of editing every route.
 */
function PageShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        "px-[var(--gutter-x)] py-[var(--gutter-y)] space-y-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * Fills the viewport below the app header, for views that manage their own
 * internal scrolling (builder, library, packs, templates).
 *
 * Replaces the hardcoded h-[calc(100vh-49px)] that was copied into seven
 * files — 49px being the header height, which nothing enforced. It is now
 * derived from --header-height, which the header itself is sized by.
 */
function FullHeightView({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="full-height-view"
      className={cn(
        "flex flex-col h-[calc(100vh-var(--header-height))]",
        className
      )}
      {...props}
    />
  )
}

export { FullHeightView, PageShell }
