"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewVersionModal } from "./new-version-modal";
import { compareUrl, deckPageUrl, gamesPageUrl, type VersionSummary } from "@/lib/deck-api";

interface Props {
  deckId: string;
  versionId: string;
  versions: VersionSummary[];
}

function label(version: VersionSummary): string {
  return version.isCurrent ? `${version.name} (current)` : version.name;
}

const chip =
  "text-body px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors";

/**
 * Builder-header control: which version you're editing, a jump to any other,
 * "New version" copying this one, this version's game log, and a comparison
 * against its parent. Switching navigates to `?v=`, so the page reloads that
 * version's saved cards.
 */
export function VersionSwitcher({ deckId, versionId, versions }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const viewing = versions.find((v) => v.id === versionId);

  return (
    <div className="flex items-center gap-1.5">
      {creating && viewing && (
        <NewVersionModal
          deckId={deckId}
          versions={versions}
          fromVersion={viewing}
          onClose={() => setCreating(false)}
        />
      )}

      <Select
        value={versionId}
        onValueChange={(value) => router.push(deckPageUrl(deckId, value as string))}
      >
        <SelectTrigger size="sm" aria-label="Version" className="text-body text-muted-foreground">
          <SelectValue>
            {(value) => {
              const version = versions.find((v) => v.id === value);
              return version ? label(version) : value;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {versions.map((version) => (
            <SelectItem key={version.id} value={version.id}>
              {label(version)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button onClick={() => setCreating(true)} className={chip}>
        New version
      </button>
      <Link href={gamesPageUrl(deckId, versionId)} className={chip}>
        Games{viewing && viewing.record.games > 0 ? ` (${viewing.record.games})` : ""}
      </Link>
      {versions.length > 1 && (
        <Link href={compareUrl(deckId, versionId)} className={chip}>
          Compare
        </Link>
      )}
      <Link
        href={deckPageUrl(deckId, versionId, "/versions")}
        className="text-body text-muted-foreground hover:text-foreground transition-colors"
      >
        All versions
      </Link>
    </div>
  );
}
