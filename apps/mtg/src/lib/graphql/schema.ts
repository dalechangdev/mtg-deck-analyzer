import { builder } from "./builder";

// Side-effect imports: each module registers its types and fields on the
// shared builder, so every one of them has to run before toSchema() is called.
import "./card";
import "./deck";

/**
 * The executable schema.
 *
 * Nothing in this import graph reaches the database or `next/headers` at module
 * scope — the context types come in through `import type` and are erased — so
 * scripts/emit-graphql-schema.ts can build the SDL outside a request.
 */
export const schema = builder.toSchema();
