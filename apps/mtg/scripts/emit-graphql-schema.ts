import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { lexicographicSortSchema, printSchema } from "graphql";
import { schema } from "../src/lib/graphql/schema";

/**
 * Prints the Pothos schema to SDL.
 *
 * The SDL is a build artefact, but a committed one: it is what @graphql-codegen
 * reads to generate the client types, and it makes a schema change show up in
 * review as a diff rather than as a behaviour nobody looked at.
 *
 * Sorted lexicographically so the diff reflects real changes rather than the
 * order the builder happened to register fields in.
 */
const OUTPUT = resolve(import.meta.dirname, "../graphql/schema.graphql");

const sdl = `${printSchema(lexicographicSortSchema(schema))}`;

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, sdl);

console.log(`Wrote ${OUTPUT} (${sdl.split("\n").length} lines).`);
