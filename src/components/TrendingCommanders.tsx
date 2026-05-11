"use client";

// Horizontal-scroll strip of currently-trending commanders on EDHREC.
// Pulls top-N from EDHREC's /top/commanders page, resolves each to a
// real Scryfall Card so we have art + color identity, and renders a
// tappable card that routes to /commanders with the deck-pre-create
// fast path.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { edhrec } from "@/lib/edhrec";
import { scryfall, frontImage } from "@/lib/scryfall";
import { useDeckStore } from "@/lib/store";
import { canBeCommander } from "@/lib/commander-rules";
import type { Card } from "@/lib/types";
import { ColorIdentityPips } from "./ManaCost";

const TARGET_COUNT = 10;

export function TrendingCommanders() {
  const router = useRouter();
  const { createDeck, setActiveDeck, setCommander } = useDeckStore();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await edhrec.topCommanders();
        if (!page) {
          if (!cancelled) setError("Couldn't reach EDHREC right now.");
          return;
        }
        const flat = edhrec.flattenRecs(page);
        // Collect names from the most-prominent section (EDHREC's top
        // commanders page usually has a single primary list at index 0).
        const names: string[] = [];
        for (const grp of flat) {
          for (const c of grp.cards) {
            if (!names.includes(c.name)) names.push(c.name);
            if (names.length >= TARGET_COUNT) break;
          }
          if (names.length >= TARGET_COUNT) break;
        }
        if (names.length === 0) {
          if (!cancelled) setCards([]);
          return;
        }
        const fetched = await scryfall.collection(names.map((name) => ({ name })));
        // Preserve EDHREC's ranking order; collection() may reorder.
        const byName = new Map(fetched.map((c) => [c.name.toLowerCase(), c]));
        const ordered = names
          .map((n) => byName.get(n.toLowerCase()))
          .filter((c): c is Card => !!c && canBeCommander(c));
        if (!cancelled) setCards(ordered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load trending");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function pick(c: Card) {
    // Same flow as the CommanderPicker's path-2 fill-empty: create a
    // fresh deck and assign this card as commander immediately.
    const id = createDeck(c.name);
    setActiveDeck(id);
    setCommander(id, c);
    router.push("/build");
  }

  if (error) {
    return null; // silently hide if EDHREC is unreachable; not critical
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-xl text-amber-300">Trending commanders</h2>
        <span className="text-xs text-zinc-500">via EDHREC · updated daily</span>
      </div>
      {cards === null ? (
        <LoadingRow />
      ) : cards.length === 0 ? (
        <div className="text-sm text-zinc-500">No trending data available.</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
          {cards.map((c, i) => {
            const img = frontImage(c, "normal");
            return (
              <button
                key={c.id}
                onClick={() => pick(c)}
                className="flex-shrink-0 w-[140px] sm:w-[160px] snap-start group"
                title={`Start a new deck with ${c.name}`}
              >
                <div className="relative overflow-hidden rounded-lg border border-bg-border group-hover:border-amber-500 transition card-shadow">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={c.name} className="w-full block" loading="lazy" />
                  ) : (
                    <div className="aspect-[5/7] bg-bg-raised flex items-center justify-center text-xs p-2 text-center">
                      {c.name}
                    </div>
                  )}
                  <div className="absolute top-1 left-1 bg-black/60 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                    #{i + 1}
                  </div>
                </div>
                <div className="mt-1.5 text-left">
                  <div className="text-xs font-semibold truncate group-hover:text-amber-300" title={c.name}>
                    {c.name}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <ColorIdentityPips colors={c.color_identity} />
                    {c.prices?.usd && (
                      <span className="text-[10px] text-emerald-400 ml-auto">${c.prices.usd}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LoadingRow() {
  return (
    <div className="flex gap-3 overflow-x-hidden pb-2 -mx-1 px-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex-shrink-0 w-[140px] sm:w-[160px] aspect-[5/7] rounded-lg bg-bg-raised border border-bg-border animate-pulse"
        />
      ))}
    </div>
  );
}
