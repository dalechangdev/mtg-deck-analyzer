import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MTG Deck Builder",
  description: "Build and analyze Commander decks",
};

const NAV_LINKS = [
  { href: "/cards", label: "Cards" },
  { href: "/decks", label: "Decks" },
  { href: "/library", label: "Library" },
  { href: "/packs", label: "Packs" },
  { href: "/cart", label: "Cart" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="h-[var(--header-height)] border-b border-border px-[var(--gutter-x)] flex items-center gap-6 flex-shrink-0">
          <Link href="/" className="font-semibold text-foreground">
            MTG Deck Builder
          </Link>
          <nav className="flex items-center gap-4 text-ui text-muted-foreground">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
