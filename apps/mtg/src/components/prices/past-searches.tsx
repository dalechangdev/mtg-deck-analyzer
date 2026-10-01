import Link from "next/link";
import { formatCents } from "@/components/prices/price-table";

type SearchRow = {
  id: string;
  name: string;
  status: string;
  totalCents: number;
  currency: string | null;
  pricedCards: number;
  totalCards: number;
  createdAt: Date;
};

export function formatSearchDate(date: Date) {
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function PastSearches({ searches }: { searches: SearchRow[] }) {
  return (
    <ul className="divide-y divide-border/50 border-y border-border/50">
      {searches.map((s) => (
        <li key={s.id}>
          <Link
            href={`/prices/${s.id}`}
            className="flex items-baseline gap-3 py-2 text-ui hover:bg-muted/50"
          >
            <span className="flex-1 truncate">
              {s.name}
              {s.status === "stopped" && (
                <span className="ml-2 text-body text-muted-foreground">(stopped)</span>
              )}
            </span>
            <span className="text-body text-muted-foreground tabular-nums">
              {s.pricedCards} of {s.totalCards} cards
            </span>
            <span className="w-20 text-right font-medium tabular-nums">
              {formatCents(s.totalCents, s.currency)}
            </span>
            <span className="w-36 text-right text-body text-muted-foreground">
              {formatSearchDate(s.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
