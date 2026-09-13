import { requireDeckAccess } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Placeholder for AI deck synergy analysis.
 *
 * Gated before it does anything, deliberately. This is the one endpoint whose
 * marginal cost is real money per call rather than fractions of a cent, so it
 * must never be reachable anonymously: an open LLM endpoint on a public site
 * is somebody else's free API. When this is implemented it also wants a
 * per-account rate limit or credit check on top of the ownership gate.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  throw new Error("AI synergy analysis not yet implemented");
}
