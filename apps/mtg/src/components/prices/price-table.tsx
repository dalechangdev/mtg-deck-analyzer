import { Badge } from "@/components/ui/badge";
import { unitPriceCents } from "@/lib/price-summary";
import type { CardPrice, PricedLine, PrintingAttempt } from "@/lib/price-events";

/**
 * The per-card table on /prices, shared by the live run and a saved one
 * (/prices/[id]) so a snapshot reads exactly as it did when it was taken.
 */

const BOARD_LABEL = { commanders: "Commander", mainboard: null } as const;

export function formatCents(cents: number, currency: string | null) {
  return new Intl.NumberFormat("en", { style: "currency", currency: currency ?? "EUR" }).format(
    cents / 100
  );
}

function formatAge(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (24 * 60))}d ago`;
}

function describeAttempt(a: PrintingAttempt) {
  if (a.status === "error") return `${a.setName}: lookup failed`;
  if (a.status === "not_found") return `${a.setName}: not on Ítaca`;
  if (!a.inStock || a.lowestPriceCents == null) return `${a.setName}: sold out`;
  return `${a.setName}: ${formatCents(a.lowestPriceCents, a.currency)}`;
}

/** Sort buckets: in stock first (by line total), then sold out, not found, failed, pending, unknown. */
const RANK: Record<CardPrice["status"], number> = { in_stock: 0, sold_out: 1, not_found: 2, error: 3 };
function rank(line: PricedLine, result: CardPrice | undefined) {
  if (!line.key) return 5;
  return result ? RANK[result.status] : 4;
}

export function PriceTable({
  lines,
  results,
  pendingLabel = "…",
}: {
  lines: PricedLine[];
  results: Map<string, CardPrice>;
  /** Shown for a card with no result: "…" while running, "not checked" for a stopped saved run. */
  pendingLabel?: string;
}) {
  const rows = lines
    .map((line) => {
      const result = line.key ? results.get(line.key) : undefined;
      const each = unitPriceCents(result);
      const total = each != null ? each * line.quantity : null;
      return { line, result, each, total, rank: rank(line, result) };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank || (b.total ?? 0) - (a.total ?? 0) || a.line.name.localeCompare(b.line.name)
    );

  if (rows.length === 0) return null;

  return (
    <table className="w-full text-ui">
      <thead className="text-label uppercase tracking-wide text-muted-foreground">
        <tr className="border-b border-border text-left">
          <th className="py-2 pr-2 font-medium">Qty</th>
          <th className="py-2 pr-2 font-medium">Card</th>
          <th className="py-2 pr-2 font-medium">Printing</th>
          <th className="py-2 pr-2 font-medium text-right">Each</th>
          <th className="py-2 pr-2 font-medium text-right">Total</th>
          <th className="py-2 font-medium">Ítaca</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ line, result, each, total }, i) => (
          <tr key={`${line.board}|${line.name}|${line.namedSetCode}|${i}`} className="border-b border-border/50">
            <td className="py-1.5 pr-2 tabular-nums align-top">{line.quantity}</td>
            <td className="py-1.5 pr-2 align-top">
              {line.name}
              {BOARD_LABEL[line.board] && (
                <Badge variant="secondary" className="ml-2">{BOARD_LABEL[line.board]}</Badge>
              )}
            </td>
            <td className="py-1.5 pr-2 text-muted-foreground align-top">
              <PrintingCell line={line} result={result} />
            </td>
            <td className="py-1.5 pr-2 text-right tabular-nums align-top">
              {each != null ? formatCents(each, result?.best?.currency ?? null) : ""}
            </td>
            <td className="py-1.5 pr-2 text-right tabular-nums align-top">
              {total != null ? formatCents(total, result?.best?.currency ?? null) : ""}
            </td>
            <td className="py-1.5 text-muted-foreground align-top">
              <StatusCell line={line} result={result} pendingLabel={pendingLabel} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Where the price came from, and what happened to the printing the list asked for if that differs. */
function PrintingCell({ line, result }: { line: PricedLine; result: CardPrice | undefined }) {
  if (!result?.best) return <>—</>;
  const named = line.namedSetCode
    ? result.attempts.find((a) => a.setCode === line.namedSetCode)
    : undefined;
  const switched = line.namedSetCode && result.best.setCode !== line.namedSetCode;
  return (
    <>
      {result.best.setName}
      {switched && (
        <span className="block text-body">
          {named
            ? `listed: ${describeAttempt(named)}`
            : `listed: ${line.namedSetCode!.toUpperCase()} (not on Ítaca)`}
        </span>
      )}
    </>
  );
}

function StatusCell({
  line,
  result,
  pendingLabel,
}: {
  line: PricedLine;
  result: CardPrice | undefined;
  pendingLabel: string;
}) {
  if (!line.key) return <span className="text-destructive">Unknown card</span>;
  if (!result) return <span>{pendingLabel}</span>;

  const checked = result.attempts.length;
  const detail = result.attempts.map(describeAttempt).join("\n");
  const summary = (
    <span className="block text-body" title={detail}>
      {checked === 0 ? "no printing on Ítaca" : `${checked} printing${checked === 1 ? "" : "s"} checked`}
    </span>
  );

  if (result.status === "error") {
    return <span className="text-destructive">Lookup failed{summary}</span>;
  }
  if (result.status === "not_found") return <span>Not found{summary}</span>;

  const label = result.status === "in_stock" ? "In stock" : "Sold out everywhere checked";
  const best = result.best!;
  return (
    <span title={`Checked ${formatAge(best.fetchedAt)}`}>
      {best.url ? (
        <a href={best.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
          {label} ↗
        </a>
      ) : (
        label
      )}
      {summary}
    </span>
  );
}
