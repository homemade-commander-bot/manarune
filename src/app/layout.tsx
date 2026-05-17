import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manarune — Commander deck builder, collection & life tracker",
  description:
    "Build legal Magic: The Gathering Commander decks with a social-feed recommendation engine, EDHREC integration, collection tracking, in-app life tracker, and rules-aware validation. Free, no signup required.",
  // Open Graph metadata for link previews on Discord, Reddit, etc.
  openGraph: {
    title: "Manarune",
    description:
      "Free Commander deck builder, collection tracker, and table-side life tracker. EDHREC + Scryfall powered.",
    siteName: "Manarune",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Manarune — Commander deck builder",
    description:
      "Free Commander deck builder, collection tracker, and table-side life tracker.",
  },
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
