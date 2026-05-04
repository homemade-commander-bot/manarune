import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commander Forge — MTG Deck Builder",
  description:
    "Build legal Magic: The Gathering Commander decks with a social-feed recommendation engine, EDHREC integration, mana curve analysis, TCGplayer pricing, and rules-aware validation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="min-h-screen flex flex-col">{children}</div>
      </body>
    </html>
  );
}
