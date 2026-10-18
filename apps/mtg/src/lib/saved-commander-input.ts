// Request-body validation for /api/commanders. Pure, so it is tested without a database.

/** Notes are free text; cap them so one paste can't fill a row. */
export const NOTE_MAX_LENGTH = 500;

/**
 * `undefined` = field absent (leave the note alone), `null` = clear it,
 * `false` = invalid. Whitespace-only clears, the same as an empty box.
 */
export function parseNote(value: unknown): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.length > NOTE_MAX_LENGTH) return false;
  return value.trim() || null;
}
