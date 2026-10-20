import type { DeckEntry } from "@/lib/commander";

// The breakdown's graph mode: main-deck cards linked to the Scryfall tags they
// carry. Pure, like breakdownDeck, so the pruning is testable without a DOM;
// the force layout lives in the component.
//
// Every card carries ~20 tags once ancestors are rolled up, so drawing them
// all is a hairball. Only tags shared by enough cards survive, most common
// first, and cards left with no surviving tag drop out.

export type TagGraphNode =
  | { id: string; kind: "tag"; label: string; /** Copies, as in the table. */ count: number }
  | {
      id: string;
      kind: "card";
      label: string;
      cardId: string;
      typeLine: string;
      /** W/U/B/R/G, "C" for colourless, "multi" for two or more. */
      color: string;
      /** Shown tags this card links to. */
      degree: number;
    };

export type TagGraphLink = { source: string; target: string };

export type TagGraph = {
  nodes: TagGraphNode[];
  links: TagGraphLink[];
  /** Distinct tags before pruning, and cards dropped because none of theirs survived. */
  totalTags: number;
  hiddenCards: number;
};

export type TagGraphOptions = {
  /** A tag must be on at least this many copies to be drawn. */
  minCards: number;
  maxTags: number;
  /** Case-insensitive substring over tag labels, shared with the table's filter. */
  filter?: string;
  /** Labels never drawn, such as the trivia tags. */
  exclude?: ReadonlySet<string>;
};

export const tagNodeId = (label: string) => `tag:${label}`;
export const cardNodeId = (cardId: string) => `card:${cardId}`;

function colorOf(identity: string[]): string {
  if (identity.length === 0) return "C";
  return identity.length === 1 ? identity[0] : "multi";
}

export function buildTagGraph(entries: DeckEntry[], options: TagGraphOptions): TagGraph {
  const cards = entries
    .filter((e) => e.slot === "main" && !e.isCommander)
    .sort((a, b) => a.name.localeCompare(b.name));

  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const tag of new Set(card.oracleTags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + card.quantity);
    }
  }

  const needle = options.filter?.trim().toLowerCase() ?? "";
  const shown = [...counts]
    .filter(
      ([tag, count]) =>
        count >= options.minCards && !options.exclude?.has(tag) && tag.toLowerCase().includes(needle)
    )
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, options.maxTags);
  const shownSet = new Set(shown.map(([tag]) => tag));

  const nodes: TagGraphNode[] = shown.map(([label, count]) => ({
    id: tagNodeId(label),
    kind: "tag",
    label,
    count,
  }));
  const links: TagGraphLink[] = [];
  let hiddenCards = 0;

  for (const card of cards) {
    const tags = [...new Set(card.oracleTags ?? [])].filter((t) => shownSet.has(t));
    if (tags.length === 0) {
      hiddenCards += 1;
      continue;
    }
    const id = cardNodeId(card.cardId);
    nodes.push({
      id,
      kind: "card",
      label: card.name,
      cardId: card.cardId,
      typeLine: card.typeLine,
      color: colorOf(card.colorIdentity),
      degree: tags.length,
    });
    for (const tag of tags) links.push({ source: id, target: tagNodeId(tag) });
  }

  return { nodes, links, totalTags: counts.size, hiddenCards };
}
