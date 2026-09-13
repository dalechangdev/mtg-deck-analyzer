import { adapters } from "./adapters";
import { supabase } from "./supabase";

/**
 * One-off: ask each active store's adapter for its catalog roots and create the
 * first crawl target for each.
 *
 * Only the root cursor is seeded. Deeper pages are discovered by the worker as
 * it follows each page's `nextCursor`, so a group costs exactly as many target
 * rows as it has pages — no guessing, and no requests wasted on pages that do
 * not exist.
 *
 * Everything starts 'frozen'. Nothing is worth polling until somebody watches a
 * product in it; the scheduler promotes groups as watches arrive.
 */
async function main() {
  const { data: stores, error } = await supabase
    .from("stores")
    .select("id, slug, name, is_active")
    .eq("is_active", true);

  if (error) throw new Error(`could not read stores: ${error.message}`);

  for (const store of stores ?? []) {
    const slug = store.slug as string;
    const adapter = adapters.get(slug);

    if (!adapter) {
      console.warn(`skipping ${slug}: no adapter registered`);
      continue;
    }

    let roots;
    try {
      roots = await adapter.listCatalogRoots();
    } catch (err) {
      // Metrópolis throws NotImplementedError until its data source is chosen.
      // That must not abort seeding for the stores that do work.
      console.warn(`skipping ${slug}: ${String(err)}`);
      continue;
    }

    console.log(`${slug}: fetched ${roots.length} catalog roots`);

    const { data: groups, error: groupError } = await supabase
      .from("catalog_groups")
      .upsert(
        roots.map((r) => ({
          store_id: store.id as number,
          external_id: r.cursor,
          name: r.label,
          crawl_tier: "frozen",
        })),
        { onConflict: "store_id,external_id" }
      )
      .select("id, external_id");

    if (groupError) throw new Error(`catalog_groups upsert failed: ${groupError.message}`);

    const targets = (groups ?? []).map((g) => ({
      store_id: store.id as number,
      group_id: g.id as number,
      cursor: g.external_id as string,
      tier: "frozen",
    }));

    const { error: targetError } = await supabase
      .from("crawl_targets")
      .upsert(targets, { onConflict: "store_id,cursor", ignoreDuplicates: true });

    if (targetError) throw new Error(`crawl_targets upsert failed: ${targetError.message}`);

    console.log(`${slug}: seeded ${targets.length} crawl targets`);
  }
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
