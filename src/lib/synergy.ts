export type SynergyTheme =
  | "COUNTERS"
  | "CARD_DRAW"
  | "GRAVEYARD"
  | "SACRIFICE"
  | "TOKENS"
  | "LIFEGAIN"
  | "DISCARD"
  | "ARTIFACTS"
  | "ENCHANTMENTS"
  | "BURN"
  | "FLICKER"
  | "COPY"
  | "SPELLSLINGER"
  | "RAMP"
  | "TUTORS"
  | "COMBAT_DAMAGE"
  | "MILL"
  | "TRIBAL";

export const THEME_LABELS: Record<SynergyTheme, string> = {
  COUNTERS: "+1/+1 counters",
  CARD_DRAW: "card draw",
  GRAVEYARD: "graveyard",
  SACRIFICE: "sacrifice",
  TOKENS: "tokens",
  LIFEGAIN: "lifegain",
  DISCARD: "discard",
  ARTIFACTS: "artifacts",
  ENCHANTMENTS: "enchantments",
  BURN: "burn/damage",
  FLICKER: "flicker/blink",
  COPY: "copy effects",
  SPELLSLINGER: "spellslinger",
  RAMP: "ramp",
  TUTORS: "tutors",
  COMBAT_DAMAGE: "combat damage",
  MILL: "mill",
  TRIBAL: "tribal",
};

const THEME_PATTERNS: Record<SynergyTheme, RegExp> = {
  COUNTERS: /\+[0-9x]+\/\+[0-9x]+ counter|proliferate|put.*counter/i,
  CARD_DRAW: /draw (a|[0-9x]+) card|draws? cards?|scry|investigate|impulse draw/i,
  GRAVEYARD: /\bgraveyard\b|\breanimат|return.*from.*graveyard|dies?(?= to| |,)/i,
  SACRIFICE: /\bsacrifice\b/i,
  TOKENS: /\bcreate\b.*\btoken|\btoken creature\b|populate/i,
  LIFEGAIN: /gain [0-9x]+ life|you gain life|whenever you gain|lifelink/i,
  DISCARD: /\bdiscard\b/i,
  ARTIFACTS: /\bartifact\b/i,
  ENCHANTMENTS: /\benchantment\b|\benchant\b/i,
  BURN: /deals? [0-9x]+ damage|damage to any target/i,
  FLICKER: /exile.*return.*battlefield|flicker|blink/i,
  COPY: /\bcopy\b.{0,30}\bspell\b|\bcopy\b.{0,30}\bpermanent\b|create a (token that's a )?copy/i,
  SPELLSLINGER: /whenever you cast.{0,20}spell|magecraft/i,
  RAMP: /search.*library.*land|land.*battlefield.*tapped|add \{[wubrg2c]\}.*\{[wubrg2c]\}|treasure token/i,
  TUTORS: /search your library/i,
  COMBAT_DAMAGE: /deals? combat damage|whenever.*attacks?\b/i,
  MILL: /put.*top.*card.*graveyard|\bmill\b/i,
  TRIBAL: /\bof the chosen type\b|share.*creature type|each .+ you control|other .+ you control/i,
};

export function extractThemes(
  oracleText: string | null,
  keywords: string[]
): Set<SynergyTheme> {
  const themes = new Set<SynergyTheme>();
  const text = oracleText ?? "";

  for (const [theme, pattern] of Object.entries(THEME_PATTERNS) as [SynergyTheme, RegExp][]) {
    if (pattern.test(text)) themes.add(theme);
  }

  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (k === "proliferate") themes.add("COUNTERS");
    if (k === "lifelink") themes.add("LIFEGAIN");
    if (k === "populate") themes.add("TOKENS");
    if (k === "magecraft") themes.add("SPELLSLINGER");
    if (k === "mill") themes.add("MILL");
  }

  return themes;
}

export type SynergyResult = {
  score: 0 | 1 | 2 | 3;
  matchedThemes: SynergyTheme[];
};

export function scoreCardSynergy(
  cardOracleText: string | null,
  cardKeywords: string[],
  commanderThemes: Set<SynergyTheme>
): SynergyResult {
  if (commanderThemes.size === 0) return { score: 0, matchedThemes: [] };

  const cardThemes = extractThemes(cardOracleText, cardKeywords);
  const matched = ([...cardThemes] as SynergyTheme[]).filter((t) =>
    commanderThemes.has(t)
  );

  const score =
    matched.length === 0 ? 0 :
    matched.length === 1 ? 1 :
    matched.length === 2 ? 2 : 3;

  return { score: score as 0 | 1 | 2 | 3, matchedThemes: matched };
}
