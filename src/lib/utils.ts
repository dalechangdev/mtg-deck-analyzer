import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge only knows Tailwind's built-in scales. The custom type scale
 * and status ramps from globals.css have to be registered here, or `cn()`
 * silently emits conflicting classes and lets stylesheet order pick a winner
 * (e.g. cn("text-base", "text-ui") would keep both).
 *
 * Keep these lists in sync with the @theme blocks in src/app/globals.css.
 */
const FONT_SIZES = ["micro", "label", "body", "ui", "lead", "title", "display"]

const STATUS_RAMPS = ["danger", "warning", "success", "info", "highlight"]

const STATUS_COLORS = STATUS_RAMPS.flatMap((ramp) => [
  ramp,
  `${ramp}-surface`,
  `${ramp}-surface-strong`,
  `${ramp}-line`,
  `${ramp}-border`,
])

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZES }],
      "text-color": [{ text: STATUS_COLORS }],
      "bg-color": [{ bg: STATUS_COLORS }],
      "border-color": [{ border: STATUS_COLORS }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
