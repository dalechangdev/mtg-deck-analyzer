import assert from "node:assert/strict";
import test from "node:test";

import { NOTE_MAX_LENGTH, parseNote } from "../src/lib/saved-commander-input";

test("absent leaves the note alone, null clears it", () => {
  assert.equal(parseNote(undefined), undefined);
  assert.equal(parseNote(null), null);
});

test("trims, and whitespace-only clears", () => {
  assert.equal(parseNote("  voltron  "), "voltron");
  assert.equal(parseNote("   "), null);
  assert.equal(parseNote(""), null);
});

test("rejects non-strings and over-long notes", () => {
  assert.equal(parseNote(42), false);
  assert.equal(parseNote({}), false);
  assert.equal(parseNote("x".repeat(NOTE_MAX_LENGTH + 1)), false);
  assert.equal(parseNote("x".repeat(NOTE_MAX_LENGTH)), "x".repeat(NOTE_MAX_LENGTH));
});
