import type { GameLogEntry, GameResult } from "@/lib/deck-api";
import type { ValidationFailure, ValidationResult } from "@/lib/template-input";

// Request validation and serialisation for the game log endpoints. Same result
// shape as the template and version endpoints, so routes unwrap all three alike.

const RESULTS: readonly GameResult[] = ["WIN", "LOSS", "DRAW"];
const MAX_NOTES_LENGTH = 10_000;
const MAX_OPPONENTS_LENGTH = 500;
/** Slack for a player whose local "today" is ahead of UTC. */
const FUTURE_TOLERANCE_MS = 36 * 60 * 60 * 1000;

type GameFields = {
  playedAt?: Date;
  result?: GameResult | null;
  podSize?: number | null;
  opponents?: string | null;
  turns?: number | null;
  notes?: string;
};

function fail(error: string): ValidationFailure {
  return { ok: false, error, status: 400 };
}

/**
 * `YYYY-MM-DD` → 12:00 UTC on that date.
 *
 * A game is logged by calendar day, not instant. Storing noon UTC means the
 * `toISOString().slice(0, 10)` read-back is the same day the player picked,
 * whichever timezone they entered it from.
 */
function parsePlayedAt(raw: unknown): ValidationResult<Date> {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return fail("playedAt must be a date (YYYY-MM-DD)");
  }
  const date = new Date(`${raw}T12:00:00.000Z`);
  // Round-trip check rejects dates JS would roll over, like 2026-02-31.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    return fail("playedAt is not a real date");
  }
  if (date.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    return fail("playedAt can't be in the future");
  }
  return { ok: true, value: date };
}

/** Absent, null and "" all mean "not recorded". */
function parseOptionalInt(
  raw: unknown,
  name: string,
  min: number,
  max: number
): ValidationResult<number | null> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    return fail(`${name} must be a whole number from ${min} to ${max}`);
  }
  return { ok: true, value: raw };
}

/** Validates only the keys present, so an update never touches a column it wasn't sent. */
function parseFields(body: Record<string, unknown>): ValidationResult<GameFields> {
  const fields: GameFields = {};

  if ("playedAt" in body) {
    const playedAt = parsePlayedAt(body.playedAt);
    if (!playedAt.ok) return playedAt;
    fields.playedAt = playedAt.value;
  }

  if ("result" in body) {
    if (body.result === null) fields.result = null;
    else if (RESULTS.includes(body.result as GameResult)) fields.result = body.result as GameResult;
    else return fail("result must be WIN, LOSS, DRAW or null");
  }

  if ("podSize" in body) {
    const podSize = parseOptionalInt(body.podSize, "podSize", 2, 10);
    if (!podSize.ok) return podSize;
    fields.podSize = podSize.value;
  }

  if ("turns" in body) {
    const turns = parseOptionalInt(body.turns, "turns", 1, 99);
    if (!turns.ok) return turns;
    fields.turns = turns.value;
  }

  if ("opponents" in body) {
    const raw = body.opponents;
    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      return fail("opponents must be a string");
    }
    if (typeof raw === "string" && raw.length > MAX_OPPONENTS_LENGTH) {
      return fail(`opponents must be ${MAX_OPPONENTS_LENGTH} characters or fewer`);
    }
    fields.opponents = typeof raw === "string" ? raw.trim() || null : null;
  }

  if ("notes" in body) {
    if (typeof body.notes !== "string" || !body.notes.trim()) return fail("notes required");
    if (body.notes.length > MAX_NOTES_LENGTH) {
      return fail(`notes must be ${MAX_NOTES_LENGTH} characters or fewer`);
    }
    fields.notes = body.notes.trim();
  }

  return { ok: true, value: fields };
}

/** POST body. Notes are the point of a log entry, so they're required; playedAt defaults to now. */
export function parseNewGame(
  body: Record<string, unknown>
): ValidationResult<GameFields & { notes: string }> {
  const parsed = parseFields(body);
  if (!parsed.ok) return parsed;
  const { notes } = parsed.value;
  if (notes === undefined) return fail("notes required");
  return { ok: true, value: { ...parsed.value, notes } };
}

/** PATCH body. At least one field; `null` clears an optional one. */
export function parseGameUpdate(body: Record<string, unknown>): ValidationResult<GameFields> {
  const parsed = parseFields(body);
  if (!parsed.ok) return parsed;
  if (Object.keys(parsed.value).length === 0) return fail("Nothing to update");
  return parsed;
}

type GameLogRow = {
  id: string;
  playedAt: Date;
  result: GameResult | null;
  podSize: number | null;
  opponents: string | null;
  turns: number | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toGameLogEntry(row: GameLogRow): GameLogEntry {
  return {
    id: row.id,
    playedAt: row.playedAt.toISOString().slice(0, 10),
    result: row.result,
    podSize: row.podSize,
    opponents: row.opponents,
    turns: row.turns,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Newest game first; same-day games in the order they were logged, newest first. */
export const gameLogOrderBy = [{ playedAt: "desc" as const }, { createdAt: "desc" as const }];
