import "server-only";

import { prisma } from "@/lib/prisma";
import { itaca } from "@/lib/itaca-client";
import { nameCandidates, type DeckLine } from "@/lib/decklist";
import { fetchPaperPrintings, type PaperPrinting } from "@/lib/scryfall";
import { MAX_ATTEMPTS_PER_CARD, orderPrintings, pickBest } from "@/lib/printing-choice";
import type { CardPrice, PricedLine, PrintingAttempt } from "@/lib/price-events";

/**
 * Server half of /prices: resolve pasted lines to cards, then price each card
 * across its printings on Ítaca, one cached product page per printing.
 * See docs/plans/moxfield-prices.md for why it is shaped around the 5s delay.
 */

const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
/** A miss is usually a printing Ítaca doesn't carry, which won't change soon. */
const NOT_FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CardToPrice = { cardId: string; cardName: string; namedSetCode: string | null };

export async function resolveLines(lines: DeckLine[]): Promise<PricedLine[]> {
  const candidates = [...new Set(lines.flatMap((l) => nameCandidates(l.name)))];
  if (candidates.length === 0) return [];

  const cards = await prisma.card.findMany({
    where: {
      OR: [
        { name: { in: candidates, mode: "insensitive" } },
        { faces: { some: { name: { in: candidates, mode: "insensitive" } } } },
      ],
    },
    select: { id: true, name: true, faces: { select: { name: true } } },
  });

  // Full names win over face names, so a face that shares a name with another
  // card can't shadow it.
  const byName = new Map<string, (typeof cards)[number]>();
  for (const card of cards) {
    for (const face of card.faces) {
      const k = face.name.toLowerCase();
      if (!byName.has(k)) byName.set(k, card);
    }
  }
  for (const card of cards) byName.set(card.name.toLowerCase(), card);

  return lines.map((line) => {
    const card = nameCandidates(line.name)
      .map((n) => byName.get(n.toLowerCase()))
      .find(Boolean);
    return {
      quantity: line.quantity,
      name: card?.name ?? line.name,
      board: line.board,
      key: card?.id ?? null,
      namedSetCode: line.setCode,
    };
  });
}

/** One entry per distinct card, carrying the first set any of its lines named. */
export function uniqueCards(lines: PricedLine[]): CardToPrice[] {
  const out = new Map<string, CardToPrice>();
  for (const l of lines) {
    if (!l.key) continue;
    const seen = out.get(l.key);
    if (!seen) out.set(l.key, { cardId: l.key, cardName: l.name, namedSetCode: l.namedSetCode });
    else seen.namedSetCode ??= l.namedSetCode;
  }
  return [...out.values()];
}

type Candidate = PaperPrinting & { slug: string };

/**
 * The printings worth an Ítaca request, in the order to try them, capped.
 * A set Ítaca doesn't list costs nothing — mapping uses the cached expansions
 * index. Only the named printing may match its set loosely; for the rest a
 * fuzzy guess would spend 5s on a set that probably isn't the one meant.
 */
async function candidatePrintings(card: CardToPrice): Promise<Candidate[]> {
  const printings = await fetchPaperPrintings(card.cardId).catch(() => []);
  const out: Candidate[] = [];
  const slugs = new Set<string>();
  for (const p of orderPrintings(printings, card.namedSetCode)) {
    if (out.length >= MAX_ATTEMPTS_PER_CARD) break;
    const slug = await itaca.findExpansionSlug(p.setName, {
      fuzzy: p.setCode === card.namedSetCode,
    });
    if (!slug || slugs.has(slug)) continue;
    slugs.add(slug);
    out.push({ ...p, slug });
  }
  return out;
}

async function readFreshAttempts(
  cardId: string,
  candidates: Candidate[]
): Promise<Map<string, PrintingAttempt>> {
  if (candidates.length === 0) return new Map();
  const rows = await prisma.itacaPrice.findMany({
    where: { cardId, setCode: { in: candidates.map((c) => c.setCode) } },
  });
  const names = new Map(candidates.map((c) => [c.setCode, c.setName]));
  const now = Date.now();
  const fresh = new Map<string, PrintingAttempt>();
  for (const row of rows) {
    const ttl = row.status === "found" ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
    if (now - row.fetchedAt.getTime() > ttl) continue;
    fresh.set(row.setCode, {
      setCode: row.setCode,
      setName: names.get(row.setCode) ?? row.setCode.toUpperCase(),
      status: row.status === "found" ? "found" : "not_found",
      inStock: row.inStock,
      lowestPriceCents: row.lowestPriceCents,
      currency: row.currency,
      url: row.url,
      fetchedAt: row.fetchedAt.toISOString(),
      cached: true,
    });
  }
  return fresh;
}

/**
 * One Ítaca product page (≥5s, paced by the shared client), written to the
 * cache. Never runs the set-scan fallback. Transport errors are returned, not
 * cached, so the next run retries them.
 */
async function fetchAttempt(card: CardToPrice, c: Candidate): Promise<PrintingAttempt> {
  const base = { setCode: c.setCode, setName: c.setName, cached: false };
  let pricing;
  try {
    pricing = await itaca.getPricingInExpansion(card.cardName, c.slug, { scan: false });
  } catch {
    const fetchedAt = new Date().toISOString();
    return { ...base, status: "error", inStock: false, lowestPriceCents: null, currency: null, url: null, fetchedAt };
  }

  const data = {
    status: pricing ? "found" : "not_found",
    // JSON-LD prices are float euros; cents from here on.
    lowestPriceCents: pricing?.lowestPrice != null ? Math.round(pricing.lowestPrice * 100) : null,
    currency: pricing?.currency ?? null,
    inStock: pricing?.inStock ?? false,
    url: pricing?.url ?? null,
    fetchedAt: new Date(),
  };
  await prisma.itacaPrice.upsert({
    where: { cardId_setCode: { cardId: card.cardId, setCode: c.setCode } },
    create: { cardId: card.cardId, setCode: c.setCode, ...data },
    update: data,
  });
  return {
    ...base,
    status: pricing ? "found" : "not_found",
    inStock: data.inStock,
    lowestPriceCents: data.lowestPriceCents,
    currency: data.currency,
    url: data.url,
    fetchedAt: data.fetchedAt.toISOString(),
  };
}

/**
 * Prices one card across up to MAX_ATTEMPTS_PER_CARD printings, cache first.
 * Returns null if `signal` aborts mid-card; attempts made so far stay cached,
 * so a re-run resumes where this one stopped. `onAttempt` fires before each
 * Ítaca request with its 1-based position among the candidates.
 */
export async function priceCard(
  card: CardToPrice,
  signal: AbortSignal,
  onAttempt?: (attempt: number, of: number) => void
): Promise<CardPrice | null> {
  const candidates = await candidatePrintings(card);
  const cached = await readFreshAttempts(card.cardId, candidates);

  const attempts: PrintingAttempt[] = [];
  for (const [i, c] of candidates.entries()) {
    const hit = cached.get(c.setCode);
    if (hit) {
      attempts.push(hit);
      continue;
    }
    if (signal.aborted) return null;
    onAttempt?.(i + 1, candidates.length);
    attempts.push(await fetchAttempt(card, c));
  }
  return pickBest(card.cardId, attempts, card.namedSetCode);
}
