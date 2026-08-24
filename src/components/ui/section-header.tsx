import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The "SMALL CAPS GREY LABEL" treatment, which appeared 32 times across the
 * app in two shapes: a padded block heading, and a bare inline label.
 *
 * SectionHeader is the block form (own padding + background), SectionLabel the
 * inline one (typography only, no box).
 */

const sectionHeaderVariants = cva(
  "flex items-center gap-2 px-3 font-semibold uppercase tracking-wider text-muted-foreground",
  {
    variants: {
      variant: {
        /** Group heading inside a scrolling list. */
        group: "py-1.5 text-label bg-muted/20",
        /** Heading at the top of a panel or column. */
        panel: "py-2 text-body border-b border-border",
        /** Panel heading that also holds controls. */
        toolbar: "py-1.5 text-label bg-muted/30 border-b border-border",
      },
      sticky: {
        true: "sticky top-0",
        false: "",
      },
    },
    defaultVariants: {
      variant: "group",
      sticky: false,
    },
  }
)

function SectionHeader({
  className,
  variant,
  sticky,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof sectionHeaderVariants>) {
  return (
    <div
      data-slot="section-header"
      className={cn(sectionHeaderVariants({ variant, sticky }), className)}
      {...props}
    />
  )
}

const sectionLabelVariants = cva("font-semibold uppercase tracking-wider", {
  variants: {
    size: {
      micro: "text-micro",
      label: "text-label",
      body: "text-body",
    },
    tone: {
      muted: "text-muted-foreground",
      /** Inherit colour from the parent — for status-tinted headings. */
      inherit: "",
    },
  },
  defaultVariants: {
    size: "label",
    tone: "muted",
  },
})

function SectionLabel({
  className,
  size,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof sectionLabelVariants>) {
  return (
    <span
      data-slot="section-label"
      className={cn(sectionLabelVariants({ size, tone }), className)}
      {...props}
    />
  )
}

export { SectionHeader, SectionLabel, sectionLabelVariants }
