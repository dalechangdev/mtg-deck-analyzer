import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Typed end-to-end, second half.
 *
 * Pothos infers the SDL from the resolvers (scripts/emit-graphql-schema.ts) and
 * the client preset turns that SDL into typed documents: a component writes
 * `graphql(\`query … \`)` and the result type is inferred from the schema. No
 * hand-written response shapes, and a field that disappears from the schema
 * becomes a type error in the component that selected it.
 *
 * Reads the committed SDL rather than introspecting a running server, so
 * codegen works offline and in CI without a database.
 */
const config: CodegenConfig = {
  schema: "graphql/schema.graphql",
  documents: ["src/**/*.ts", "src/**/*.tsx", "!src/generated/**"],
  ignoreNoDocuments: true,
  generates: {
    "src/generated/graphql/": {
      preset: "client",
      config: {
        // Timestamps arrive as ISO-8601 strings; the DateTime scalar serialises
        // to string even though resolvers hand it a Date.
        scalars: { DateTime: "string" },
        // Emit documents as TypedDocumentString rather than parsed
        // DocumentNodes. The result types are identical either way; the
        // difference is that the client never imports graphql-js, which is a
        // parser the browser has no use for when the server is the only thing
        // that parses a query.
        //
        // This belongs in `config`, not `presetConfig` — the preset reads
        // `options.config.documentMode`, and putting it in `presetConfig` is
        // silently ignored rather than rejected.
        documentMode: "string",
      },
    },
  },
};

export default config;
