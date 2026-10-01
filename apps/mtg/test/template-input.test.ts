/**
 * Publishing and description rules in template-input.ts.
 *
 * No database: none of these bodies carry a name or requirements, the only
 * fields whose checks query Postgres.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DESCRIPTION_LENGTH,
  validateTemplateUpdate,
} from "../src/lib/template-input";

const OWNER = "00000000-0000-0000-0000-00000000000a";
const update = (body: Record<string, unknown>) => validateTemplateUpdate(body, OWNER, "t1");

test("an update can publish and unpublish", async () => {
  assert.deepEqual(await update({ isPublic: true }), { ok: true, value: { isPublic: true } });
  assert.deepEqual(await update({ isPublic: false }), { ok: true, value: { isPublic: false } });
});

test("isPublic must be a boolean, not a truthy string", async () => {
  for (const isPublic of ["true", 1, null]) {
    const result = await update({ isPublic });
    assert.equal(result.ok, false, `accepted ${JSON.stringify(isPublic)}`);
  }
});

test("an update that omits isPublic leaves visibility alone", async () => {
  assert.deepEqual(await update({ description: "x" }), { ok: true, value: { description: "x" } });
});

test("description is capped once it can be shown to other accounts", async () => {
  const atLimit = "a".repeat(MAX_DESCRIPTION_LENGTH);
  assert.equal((await update({ description: atLimit })).ok, true);

  const over = await update({ description: atLimit + "a" });
  assert.equal(over.ok, false);
});

test("the cap applies after trimming", async () => {
  const padded = `  ${"a".repeat(MAX_DESCRIPTION_LENGTH)}  `;
  assert.equal((await update({ description: padded })).ok, true);
});
