/**
 * Plain-text decklist parsing, for the paste box on /prices.
 *
 * The target is Moxfield's Export → "Copy as plain text" (`1 Sol Ring (CMM) 410`),
 * but the same parser takes the Arena/MTGO shapes people paste from elsewhere:
 * bare names, `1x`, section headers, foil marks. Pure — no Prisma, no
 * server-only — so node:test can load it.
 */

export type DeckBoard = "commanders" | "mainboard";

export type DeckLine = {
  quantity: number;
  /** As written. DFCs may arrive as `A // B`, `A / B` or just `A`; resolution handles all three. */
  name: string;
  /** Lower-case set code from `(CMM)`, or null when the line names no set. */
  setCode: string | null;
  board: DeckBoard;
};

export type ParsedDecklist = {
  lines: DeckLine[];
  /** Non-blank lines that were neither a card nor a header, shown back to the user. */
  unparsed: string[];
};

/** Sections that are priced, and the board they map to. Anything else listed in SKIPPED is dropped. */
const PRICED_SECTIONS: Record<string, DeckBoard> = {
  commander: "commanders",
  commanders: "commanders",
  deck: "mainboard",
  main: "mainboard",
  mainboard: "mainboard",
  companion: "mainboard",
};

const SKIPPED_SECTIONS = new Set([
  "sideboard",
  "maybeboard",
  "considering",
  "tokens",
  "token",
]);

const HEADER = /^(?:\/\/\s*)?([a-z]+)\s*:?\s*(?:\(\d+\))?$/i;
const CARD = /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([a-z0-9]{2,6})\)(?:\s+[^\s(]+)?)?$/i;
/** `*F*` (foil), `*E*` (etched) and the like, trailing the collector number. */
const FINISH_MARK = /\s+\*[a-z]+\*$/i;

export function parseDecklist(text: string): ParsedDecklist {
  const merged = new Map<string, DeckLine>();
  const unparsed: string[] = [];
  let board: DeckBoard | null = "mainboard";

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;

    const header = line.match(HEADER);
    if (header) {
      const section = header[1].toLowerCase();
      if (section in PRICED_SECTIONS) {
        board = PRICED_SECTIONS[section];
        continue;
      }
      if (SKIPPED_SECTIONS.has(section)) {
        board = null;
        continue;
      }
      // A one-word line that isn't a known header is a card name ("Forest").
    }
    if (line.startsWith("//") || line.startsWith("#")) continue;

    while (FINISH_MARK.test(line)) line = line.replace(FINISH_MARK, "");

    const card = line.match(CARD);
    if (!card) {
      unparsed.push(raw.trim());
      continue;
    }
    if (board === null) continue;

    const quantity = card[1] ? Number(card[1]) : 1;
    const name = card[2].trim();
    const setCode = card[3]?.toLowerCase() ?? null;
    if (quantity < 1 || !name) {
      unparsed.push(raw.trim());
      continue;
    }

    const key = `${board}|${name.toLowerCase()}|${setCode ?? ""}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { quantity, name, setCode, board });
  }

  return { lines: [...merged.values()], unparsed };
}

const BASIC_LANDS = new Set(
  ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"].flatMap((n) => [
    n.toLowerCase(),
    `snow-covered ${n.toLowerCase()}`,
  ])
);

export function isBasicLand(name: string): boolean {
  return BASIC_LANDS.has(name.trim().toLowerCase());
}

/**
 * Names to try against `Card.name` and `CardFace.name`. Scryfall writes
 * multi-face cards as `A // B`; exports also use `A / B` or the front face alone.
 */
export function nameCandidates(name: string): string[] {
  const parts = name.split(/\s+\/\/?\s+/);
  const out = new Set([name]);
  if (parts.length > 1) {
    out.add(parts.join(" // "));
    out.add(parts[0]);
  }
  return [...out];
}
