export function normalize(name: string): string {
  return name
    .replace(/['’]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(name: string): string {
  return normalize(name).replace(/\s+/g, "-");
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&euro;/g, "€")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Collapses tags and whitespace so inner text can be compared or stored. */
export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Parses itaca's European price format ("1.234,56 €") into integer cents.
 * Returns null for the sold-out placeholders ("Sin stock", "Próximamente").
 */
export function parsePriceCents(raw: string): number | null {
  const text = stripTags(raw);
  const match = text.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
  if (match) {
    const whole = match[1].replace(/\./g, "");
    return Number(whole) * 100 + Number(match[2]);
  }
  // Fall back to a bare integer price with no decimal part.
  const bare = text.match(/(\d+)\s*€/);
  return bare ? Number(bare[1]) * 100 : null;
}
