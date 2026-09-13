import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations run over the DIRECT connection (port 5432), never the pooler.
    // Supavisor's transaction mode multiplexes statements across backends, so
    // the session-scoped advisory lock Prisma takes out to serialise a
    // migration would be acquired on one connection and checked on another.
    // Falls back to DATABASE_URL so a plain local Postgres still works.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
