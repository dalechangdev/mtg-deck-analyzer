import { requireUserId } from "@/lib/auth";
import { loadSavedCommanders } from "@/lib/saved-commanders";
import { SavedCommanderList } from "@/components/commanders/saved-commander-list";

export const dynamic = "force-dynamic";

/** Commanders saved to build around later (docs/plans/saved-commanders.md). */
export default async function CommandersPage() {
  const userId = await requireUserId();
  const entries = await loadSavedCommanders(userId, { withDecks: true });
  return <SavedCommanderList initialEntries={entries} />;
}
