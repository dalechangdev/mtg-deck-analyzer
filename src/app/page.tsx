import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-32 gap-4">
      <h1 className="text-4xl font-bold">MTG Deck Builder</h1>
      <p className="text-muted-foreground">Build and analyze Commander decks</p>
      <div className="flex gap-3 mt-4">
        <Link href="/cards" className={cn(buttonVariants())}>
          Browse Cards
        </Link>
        <Link href="/decks" className={cn(buttonVariants({ variant: "outline" }))}>
          My Decks
        </Link>
      </div>
    </div>
  );
}
