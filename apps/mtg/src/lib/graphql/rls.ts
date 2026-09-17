import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The GraphQL endpoint's authorisation boundary.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Everywhere else in this app, authorisation is application code: Prisma
 * connects as a privileged role that RLS does not constrain, so every REST
 * handler filters by the id from src/lib/auth.ts and goes through
 * src/lib/ownership.ts. See prisma/migrations/*_add_ownership_and_rls.
 *
 * A GraphQL schema cannot follow that model without re-deriving ownership in
 * every resolver — the thing a graph makes easy is exactly the nesting that
 * makes "did I remember the userId filter?" impossible to eyeball. So the
 * GraphQL endpoint takes the other road: it runs its queries as the database
 * roles the Data API uses, and lets the RLS policies that already exist decide
 * what is visible.
 *
 * That works because of two properties of this database, both verified rather
 * than assumed (see docs/plans/graphql-endpoint.md):
 *
 *   1. auth.uid() reads the `request.jwt.claims` GUC, not a connection
 *      property, so it can be set per transaction.
 *   2. The connecting role is a member of `authenticated` and `anon`, so it can
 *      downgrade itself with SET LOCAL ROLE.
 *
 * Both settings are transaction-local: they unwind at COMMIT/ROLLBACK, so the
 * connection returns to the pool with its privileges intact. That is also what
 * makes this safe through Supavisor's transaction pooler, where a session-level
 * SET would leak into whatever query reused the backend next.
 *
 * FAIL CLOSED
 * -----------
 * The hazard here is not a query that errors — it is a query that succeeds with
 * RLS absent, which would read every account's rows and say nothing. So the
 * downgrade is verified inside the transaction before any resolver runs, and a
 * mismatch aborts the request.
 */

/** A Prisma client bound to one RLS-scoped transaction. Resolvers get this, never the singleton. */
export type RlsClient = Prisma.TransactionClient;

/** The verified identity behind a request, or null when signed out. */
export type Viewer = {
  userId: string;
  /** The verified JWT claims, handed to Postgres as `request.jwt.claims`. */
  claims: Record<string, unknown>;
} | null;

/**
 * An interactive transaction is held open for the whole GraphQL operation,
 * because that is the unit RLS settings are scoped to. The timeout is the
 * backstop: a resolver that hangs must not hold a pooled connection forever.
 */
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

class RlsError extends Error {}

/**
 * Runs `fn` against a connection that has been downgraded to the caller's
 * database role, with RLS in force.
 *
 * Signed in  -> role `authenticated`, auth.uid() = the viewer's id.
 * Signed out -> role `anon`, which still reads the public card catalogue. That
 *               is deliberate: the card browser renders for anonymous visitors
 *               today and must keep doing so.
 */
export async function runWithRls<T>(viewer: Viewer, fn: (db: RlsClient) => Promise<T>): Promise<T> {
  const role = viewer ? "authenticated" : "anon";

  return prisma.$transaction(async (tx) => {
    // set_config(..., true) is SET LOCAL: scoped to this transaction. SET LOCAL
    // ROLE cannot take a bound parameter, which is the other reason to use the
    // function form — the role name never goes through string interpolation.
    await tx.$executeRaw`SELECT set_config('role', ${role}, true)`;

    if (viewer) {
      await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify(
        viewer.claims
      )}, true)`;
    }

    await assertDowngraded(tx, viewer, role);

    return fn(tx);
  }, TRANSACTION_OPTIONS);
}

/**
 * The guard that turns a silent privilege leak into a failed request.
 *
 * Without it, any future change that stops the SET LOCAL from taking effect —
 * a role that is no longer a member of `authenticated`, a pooler that rewrites
 * the session, a reordered statement — would leave the transaction running
 * privileged. Every query would still succeed, and would return every
 * account's rows.
 */
async function assertDowngraded(tx: RlsClient, viewer: Viewer, role: string): Promise<void> {
  const [state] = await tx.$queryRaw<{ current_role: string; uid: string | null }[]>`
    SELECT current_user::text AS current_role, (SELECT auth.uid())::text AS uid
  `;

  if (state?.current_role !== role) {
    throw new RlsError(
      `Refusing to run: expected role ${role}, connection is ${state?.current_role ?? "unknown"}.`
    );
  }

  if (viewer && state.uid !== viewer.userId) {
    throw new RlsError("Refusing to run: auth.uid() does not match the authenticated viewer.");
  }

  if (!viewer && state.uid !== null) {
    throw new RlsError("Refusing to run: anonymous request carries a database identity.");
  }
}
