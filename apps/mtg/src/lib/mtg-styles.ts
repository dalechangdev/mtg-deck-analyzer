/**
 * Visual vocabulary for MTG domain concepts.
 *
 * These maps were previously duplicated across five components and had already
 * drifted — the White pip was `bg-yellow-100` in one file and `bg-yellow-50` in
 * another for the same colour. Everything here resolves to the --mana-* and
 * --rarity-* tokens in globals.css, which are theme-independent by design.
 */

export const COLOR_LABELS: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
}

export const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const

export type ManaColor = (typeof COLOR_ORDER)[number]

/** Small filled circle with no text — used on card thumbnails and details. */
export const MANA_PIP: Record<string, string> = {
  W: "bg-mana-w border-mana-w-edge",
  U: "bg-mana-u border-mana-u-edge",
  B: "bg-mana-b border-mana-b-edge",
  R: "bg-mana-r border-mana-r-edge",
  G: "bg-mana-g border-mana-g-edge",
}

/**
 * Larger badge carrying the colour's letter — used in filter controls.
 *
 * `C` is not one of the five colours, so it is absent from COLOR_LABELS and
 * from anything that iterates the colour wheel; it exists here for the search
 * filters, which offer colourless as a sixth pip the way Scryfall does.
 */
export const MANA_CHIP: Record<string, string> = {
  W: "bg-mana-w border-mana-w-edge text-mana-w-foreground",
  U: "bg-mana-u border-mana-u-edge text-mana-u-foreground",
  B: "bg-mana-b border-mana-b-edge text-mana-b-foreground",
  R: "bg-mana-r border-mana-r-edge text-mana-r-foreground",
  G: "bg-mana-g border-mana-g-edge text-mana-g-foreground",
  C: "bg-muted border-border text-muted-foreground",
}

/** Pip labels including colourless, for the search filters. */
export const SEARCH_COLOR_LABELS: Record<string, string> = {
  ...COLOR_LABELS,
  C: "Colorless",
}

/**
 * `special` and `bonus` are distinct Scryfall rarities that share a treatment;
 * anything unrecognised falls back to `common` via RARITY_STYLE's lookup.
 */
export const RARITY_STYLE: Record<string, string> = {
  common: "bg-rarity-common text-rarity-common-foreground",
  uncommon: "bg-rarity-uncommon text-rarity-uncommon-foreground",
  rare: "bg-rarity-rare text-rarity-rare-foreground",
  mythic: "bg-rarity-mythic text-rarity-mythic-foreground",
  special: "bg-rarity-special text-rarity-special-foreground",
  bonus: "bg-rarity-special text-rarity-special-foreground",
}

export function rarityStyle(rarity: string | null | undefined): string {
  return (rarity && RARITY_STYLE[rarity]) || RARITY_STYLE.common
}
