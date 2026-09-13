import { fetchSets } from "@/lib/scryfall";
import { PackOpener } from "@/components/packs/pack-opener";

export default async function PacksPage() {
  const sets = await fetchSets();
  const initialSets = sets.map((s) => ({
    code: s.code,
    name: s.name,
    cardCount: s.card_count,
    releasedAt: s.released_at ?? null,
    iconUri: s.icon_svg_uri ?? null,
  }));

  return <PackOpener initialSets={initialSets} />;
}
