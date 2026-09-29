/**
 * The two template predicates, and a guard against the mistake they exist to
 * prevent: widening a "use" check to other accounts' public templates, which
 * would let someone else's edit or delete reach into the caller's decks
 * (docs/plans/template-library.md).
 *
 * No database: the predicates are plain Prisma filter objects.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { usableTemplateWhere, viewableTemplateWhere } from "../src/lib/template-visibility";

const USER = "00000000-0000-0000-0000-00000000000a";
const SRC = join(import.meta.dirname, "../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "generated") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("usable is own plus shared reference templates, never public ones", () => {
  assert.deepEqual(usableTemplateWhere(USER), {
    OR: [{ ownerId: USER }, { ownerId: null }],
  });
});

test("viewable adds published templates to usable", () => {
  assert.deepEqual(viewableTemplateWhere(USER), {
    OR: [{ ownerId: USER }, { ownerId: null }, { isPublic: true }],
  });
});

test("no source file inlines the visibility rule", () => {
  // A hand-written `ownerId: null` clause is how the six copies drifted before
  // they were centralised; new call sites should pick a named predicate.
  const offenders = sourceFiles(SRC)
    .filter((file) => !file.endsWith("template-visibility.ts"))
    .filter((file) => readFileSync(file, "utf8").includes("ownerId: null }"))
    .map((file) => relative(SRC, file));
  assert.deepEqual(offenders, []);
});

test("the viewable predicate is only used by the view/clone gate", () => {
  // Widen this list only for a path that previews or clones — never one that
  // attaches, scores or lists "My templates".
  const allowed = new Set(["lib/ownership.ts"]);
  const users = sourceFiles(SRC)
    .filter((file) => !file.endsWith("template-visibility.ts"))
    .filter((file) => readFileSync(file, "utf8").includes("viewableTemplateWhere"))
    .map((file) => relative(SRC, file));
  assert.deepEqual(users.filter((file) => !allowed.has(file)), []);
});
