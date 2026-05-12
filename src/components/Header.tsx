"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeckStore } from "@/lib/store";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, decks, activeDeckId, createDeck, setActiveDeck } = useDeckStore();
  const list = Object.values(decks).sort((a, b) => b.updatedAt - a.updatedAt);

  function nav(path: string) {
    return `text-sm transition-colors px-2 py-1 rounded ${
      pathname === path ? "text-amber-300 bg-bg-raised" : "text-zinc-300 hover:text-white"
    }`;
  }

  return (
    <header className="border-b border-bg-border bg-bg-panel/85 backdrop-blur sticky top-0 z-30">
      <div className="max-w-[1700px] mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-4">
        <Link
          href="/"
          className="font-display text-lg sm:text-xl tracking-wide bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent whitespace-nowrap"
        >
          {/* Same dedup trick: constant prefix, responsive suffix. */}
          ⌬ <span className="hidden sm:inline">Commander </span>Forge
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/" className={nav("/")}>My Decks</Link>
          <Link href="/build" className={nav("/build")}>Builder</Link>
          <Link href="/collection" className={nav("/collection")}>Collection</Link>
          <Link href="/play" className={nav("/play")}>Life</Link>
          <Link href="/rules" className={nav("/rules")}>Rules</Link>
        </nav>
        {/* Mobile-only compact nav (visible below md). Each route gets
            an emoji + short label so the bar fits in <320px. */}
        <nav className="md:hidden flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
          <Link href="/" className={`${nav("/")} text-xs px-2`} title="My Decks">📚</Link>
          <Link href="/build" className={`${nav("/build")} text-xs px-2`} title="Builder">🛠</Link>
          <Link href="/collection" className={`${nav("/collection")} text-xs px-2`} title="Collection">📦</Link>
          <Link href="/play" className={`${nav("/play")} text-xs px-2`} title="Life Tracker">❤️</Link>
          <Link href="/rules" className={`${nav("/rules")} text-xs px-2`} title="Rules">📜</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {list.length > 0 && pathname === "/build" && (
            <select
              className="bg-bg-raised border border-bg-border rounded px-1.5 sm:px-2 py-1 text-xs sm:text-sm max-w-[120px] sm:max-w-[200px]"
              value={activeDeckId ?? ""}
              onChange={(e) => setActiveDeck(e.target.value)}
            >
              {list.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <button
            className="btn btn-ghost text-xs sm:text-sm px-2 sm:px-3"
            onClick={() => {
              const id = createDeck("Untitled Deck");
              if (pathname !== "/commanders") router.push("/commanders");
              setActiveDeck(id);
            }}
            title="Create a new deck"
          >
            {/* Text composed of a constant root + a responsive suffix
                so a DOM-text scraper sees either "+ New" or "+ New Deck"
                but never both concatenated. */}
            + New<span className="hidden sm:inline"> Deck</span>
          </button>
          <Link href="/profile" className="flex items-center gap-2 px-1.5 sm:px-2 py-1 rounded hover:bg-bg-raised">
            <span className="text-xl sm:text-2xl leading-none">{profile.avatar}</span>
            <span className="hidden sm:inline text-sm text-zinc-200">{profile.name}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
