import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restock — itaca.gg stock alerts",
  description: "Get told when the cards you want are back in stock.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
            <span className="font-semibold">Restock</span>
            <nav className="text-sm text-muted">
              <a href="/watches" className="hover:text-foreground">
                Watches
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
