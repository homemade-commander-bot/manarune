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
      <div className="max-w-[1700px] mx-auto px-4 py-3 flex items-center gap-4">
        <Link href="/" className="font-display text-xl tracking-wide bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
          ⌬ Commander Forge
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/" className={nav("/")}>My Decks</Link>
          <Link href="/commanders" className={nav("/commanders")}>Commanders</Link>
          <Link href="/build" className={nav("/build")}>Builder</Link>
          <Link href="/collection" className={nav("/collection")}>Collection</Link>
          <Link href="/rules" className={nav("/rules")}>Rules</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {list.length > 0 && pathname === "/build" && (
            <select
              className="bg-bg-raised border border-bg-border rounded px-2 py-1 text-sm max-w-[200px]"
              value={activeDeckId ?? ""}
              onChange={(e) => setActiveDeck(e.target.value)}
            >
              {list.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => {
              const id = createDeck("Untitled Deck");
              if (pathname !== "/commanders") router.push("/commanders");
              setActiveDeck(id);
            }}
          >
            + New Deck
          </button>
          <Link href="/profile" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-raised">
            <span className="text-2xl leading-none">{profile.avatar}</span>
            <span className="hidden sm:inline text-sm text-zinc-200">{profile.name}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
