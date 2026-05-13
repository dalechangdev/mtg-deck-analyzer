import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MTG Deck Builder",
  description: "Build and analyze Commander decks",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border px-6 py-3 flex items-center gap-6">
          <Link href="/" className="font-semibold text-foreground">
            MTG Deck Builder
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/cards" className="hover:text-foreground transition-colors">
              Cards
            </Link>
            <Link href="/decks" className="hover:text-foreground transition-colors">
              Decks
            </Link>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
