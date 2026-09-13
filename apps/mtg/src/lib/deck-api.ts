// Client-safe URL builders and shapes for deck pages and the deck API. No server imports.

/** One row of a deck's version list, as the versions API and pages hand it to clients. */
export type VersionSummary = {
  id: string;
  name: string;
  notes: string | null;
  parentVersionId: string | null;
  isCurrent: boolean;
  /** Main-slot card quantity, commander included — the number checked against 100. */
  mainCount: number;
  /** Games with no recorded result count toward `games` but none of the three. */
  record: { games: number; wins: number; losses: number; draws: number };
  createdAt: string;
  updatedAt: string;
};

/** A version's card list, or one card in it when `deckCardId` is given. */
export function versionCardsUrl(deckId: string, versionId: string, deckCardId?: string): string {
  const base = `/api/decks/${deckId}/versions/${versionId}/cards`;
  return deckCardId ? `${base}/${deckCardId}` : base;
}

/** The deck's version collection, or one version when `versionId` is given. */
export function versionsApiUrl(deckId: string, versionId?: string): string {
  const base = `/api/decks/${deckId}/versions`;
  return versionId ? `${base}/${versionId}` : base;
}

/**
 * A deck page pinned to a version: `/decks/[id][subpath]?…&v=[versionId]`.
 *
 * Every in-app link between deck pages goes through this, so moving from the
 * builder to analysis and back stays on the version you were looking at rather
 * than snapping back to the current one.
 */
export function deckPageUrl(
  deckId: string,
  versionId: string,
  subpath: "" | "/builder" | "/builder/sacrifice" | "/analysis" | "/versions" = "",
  params: Record<string, string> = {}
): string {
  const search = new URLSearchParams({ ...params, v: versionId });
  return `/decks/${deckId}${subpath}?${search}`;
}

export type GameResult = "WIN" | "LOSS" | "DRAW";

/** One logged game, as the games API and page hand it to clients. */
export type GameLogEntry = {
  id: string;
  /** Calendar date, `YYYY-MM-DD`. */
  playedAt: string;
  /** Null for a game that wasn't finished or wasn't tracked. */
  result: GameResult | null;
  podSize: number | null;
  opponents: string | null;
  turns: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

/** A version's game log, or one game in it when `gameId` is given. */
export function gamesApiUrl(deckId: string, versionId: string, gameId?: string): string {
  const base = `/api/decks/${deckId}/versions/${versionId}/games`;
  return gameId ? `${base}/${gameId}` : base;
}

/** The game log page for a version. The version is in the path, not `?v=`: the page is about that version. */
export function gamesPageUrl(deckId: string, versionId: string): string {
  return `/decks/${deckId}/versions/${versionId}/games`;
}
