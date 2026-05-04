"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { scryfall } from "@/lib/scryfall";
import { searchCommanders } from "@/lib/recommend";
import { canBeCommander } from "@/lib/commander-rules";
import { useDeckStore } from "@/lib/store";
import { seedNewDeckStaples } from "@/lib/lands";
import { CardThumb } from "./CardThumb";
import { ManaCost, ColorIdentityPips } from "./ManaCost";
import type { Card } from "@/lib/types";

const COLOR_FILTERS: { label: string; value: string; color: string }[] = [
  { label: "W", value: "W", color: "mana-W" },
  { label: "U", value: "U", color: "mana-U" },
  { label: "B", value: "B", color: "mana-B" },
  { label: "R", value: "R", color: "mana-R" },
  { label: "G", value: "G", color: "mana-G" },
];

export function CommanderPicker() {
  const router = useRouter();
  const { activeDeckId, createDeck, setCommander } = useDeckStore();
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [results, setResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  const debounce = useRef<number | null>(null);

  // Run an initial "popular commanders" search so the page isn't empty.
  useEffect(() => {
    void runSearch("");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function buildQuery(text: string, cs: string[]): string {
    const parts: string[] = [];
    if (text.trim()) parts.push(text.trim());
    if (cs.length > 0) parts.push(`id<=${cs.join("").toLowerCase()}`);
    else if (text.trim() === "") parts.push("is:commander"); // popular default
    return parts.join(" ");
  }

  async function runSearch(text: string, cs = colors) {
    setLoading(true);
    setError(null);
    try {
      const q = buildQuery(text, cs);
      const cards = await searchCommanders(q, 30);
      setResults(cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function onSearchChange(text: string) {
    setQuery(text);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      try {
        const ac = await scryfall.autocomplete(text);
        setAutocomplete(ac.slice(0, 8));
      } catch {
        setAutocomplete([]);
      }
      void runSearch(text);
    }, 250);
  }

  function toggleColor(c: string) {
    const next = colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c];
    setColors(next);
    void runSearch(query, next);
  }

  async function pick(card: Card) {
    if (!canBeCommander(card)) return;
    const id = activeDeckId ?? createDeck(card.name);
    // Auto-name placeholder decks after the chosen commander.
    const deck = useDeckStore.getState().decks[id];
    if (deck && /^(Untitled Deck|New Deck)$/i.test(deck.name)) {
      useDeckStore.getState().renameDeck(id, card.name);
    }
    setCommander(id, card);
    // Seed Sol Ring + Arcane Signet for new decks. Fire-and-forget so the user
    // isn't waiting on Scryfall — staples appear as soon as they resolve.
    const fresh = useDeckStore.getState().decks[id];
    if (fresh) {
      void seedNewDeckStaples(fresh, (c) => useDeckStore.getState().addCard(id, c));
    }
    router.push("/build");
  }

  const headerText = useMemo(
    () =>
      colors.length || query
        ? `Results — ${results.length} commander${results.length === 1 ? "" : "s"}`
        : "Popular commanders",
    [colors.length, query, results.length],
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <section className="panel p-6">
        <h1 className="font-display text-3xl text-amber-400">Choose Your Commander</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Search by name, theme, or keyword. Color filters limit by color identity (CR 903.4). Only legal commanders are shown.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[280px] relative">
            <input
              type="search"
              autoFocus
              placeholder='Try "dragon", "lifegain", "Atraxa", or "tokens"…'
              value={query}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-bg-raised border border-bg-border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            {autocomplete.length > 0 && query && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-bg-raised border border-bg-border rounded shadow-lg">
                {autocomplete.map((name) => (
                  <button
                    key={name}
                    onClick={() => {
                      setAutocomplete([]);
                      setQuery(name);
                      void runSearch(name);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-bg-border"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {COLOR_FILTERS.map((c) => (
              <button
                key={c.value}
                onClick={() => toggleColor(c.value)}
                className={`mana-symbol ${c.color} ${
                  colors.includes(c.value) ? "ring-2 ring-amber-400" : "opacity-60 hover:opacity-100"
                }`}
                title={`Filter by ${c.label}`}
                style={{ width: "1.6em", height: "1.6em", fontSize: "0.9em" }}
              >
                {c.label}
              </button>
            ))}
            {colors.length > 0 && (
              <button onClick={() => { setColors([]); void runSearch(query, []); }} className="text-xs text-zinc-400 ml-2 underline">
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wider text-zinc-400">{headerText}</h2>
          {loading && <span className="text-xs text-amber-400">Searching…</span>}
        </div>
        {error && <div className="panel p-4 text-red-400 text-sm">{error}</div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map((c) => (
            <div key={c.id} className="space-y-2">
              <CardThumb card={c} onClick={() => pick(c)} />
              <div className="text-xs space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold truncate" title={c.name}>{c.name}</span>
                  <ColorIdentityPips colors={c.color_identity} />
                </div>
                <div className="text-zinc-400 truncate">{c.type_line}</div>
                <div className="flex items-center gap-2">
                  <ManaCost cost={c.mana_cost} />
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400">{c.set.toUpperCase()}</span>
                  {c.prices.usd && <span className="text-emerald-400 ml-auto">${c.prices.usd}</span>}
                </div>
                <button onClick={() => pick(c)} className="btn btn-primary w-full justify-center mt-1">
                  Use as Commander
                </button>
              </div>
            </div>
          ))}
          {!loading && results.length === 0 && !error && (
            <div className="col-span-full text-center text-zinc-500 py-12">
              No commanders match. Try a different name or color combination.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
