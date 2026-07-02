"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  deckId: string;
}

export function SacrificeThemeGate({ deckId }: Props) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(7);

  useEffect(() => {
    if (seconds <= 0) {
      router.push(`/decks/${deckId}/builder`);
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, router, deckId]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <p className="text-lg font-semibold text-red-400">
        Only sacrifice decks can access this page.
      </p>
      <p className="text-sm text-zinc-400">
        Redirecting to the deck builder in {seconds} second{seconds !== 1 ? "s" : ""}...
      </p>
    </div>
  );
}
