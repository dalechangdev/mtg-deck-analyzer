"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * The app's overlay dialog. Wraps the shadcn/Base UI Dialog in the visual
 * language the three hand-rolled modals already used (heavy scrim, flex
 * column panel, sticky header, scrolling body).
 *
 * All three hand-rolled versions reimplemented Escape-to-close and body
 * scroll locking; Base UI provides those, plus the focus trapping, outside
 * click dismissal, and aria wiring that none of them had.
 *
 * Do not re-add a manual scroll lock in a caller. One lingered here through
 * an earlier refactor and leaked `overflow: hidden` onto <body> forever: it
 * captured the "previous" value *after* Base UI had already set it, then
 * dutifully restored that on unmount.
 */

const MODAL_SIZES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-3xl",
} as const

interface ModalProps extends DialogPrimitive.Popup.Props {
  open: boolean
  onClose: () => void
  size?: keyof typeof MODAL_SIZES
}

function Modal({
  open,
  onClose,
  size = "md",
  className,
  children,
  ...props
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/70 supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Popup
          data-slot="modal"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none",
            "duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            MODAL_SIZES[size],
            className
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

/** Round dismiss button. Standalone so panels without a header can place it. */
function ModalCloseButton({
  className,
  ...props
}: DialogPrimitive.Close.Props) {
  return (
    <DialogClose
      aria-label="Close"
      className={cn(
        "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      {...props}
    >
      ✕
    </DialogClose>
  )
}

interface ModalHeaderProps
  extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
}

function ModalHeader({
  title,
  description,
  className,
  children,
  ...props
}: ModalHeaderProps) {
  return (
    <div
      data-slot="modal-header"
      className={cn(
        "flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <DialogTitle className="text-ui font-semibold">{title}</DialogTitle>
        {description && (
          <DialogDescription className="text-body text-muted-foreground">
            {description}
          </DialogDescription>
        )}
      </div>
      {children}
      <ModalCloseButton />
    </div>
  )
}

/** Scrolling region. `min-h-0` is what lets it shrink inside the flex column. */
function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-body"
      className={cn("min-h-0 flex-1 overflow-y-auto", className)}
      {...props}
    />
  )
}

export { Modal, ModalBody, ModalCloseButton, ModalHeader }
