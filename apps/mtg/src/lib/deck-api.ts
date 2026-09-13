// Client-safe URL builders for the deck API. No server imports.

/** A version's card list, or one card in it when `deckCardId` is given. */
export function versionCardsUrl(deckId: string, versionId: string, deckCardId?: string): string {
  const base = `/api/decks/${deckId}/versions/${versionId}/cards`;
  return deckCardId ? `${base}/${deckCardId}` : base;
}
