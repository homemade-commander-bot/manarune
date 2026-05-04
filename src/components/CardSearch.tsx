"use client";

import { useEffect, useRef, useState } from "react";
import { scryfall } from "@/lib/scryfall";
import { useDeckStore } from "@/lib/store";
import { commanderColorIdentity, withinColorIdentity, colorIdentityString } from "@/lib/commander-rules";
import type { Card, Deck } from "@/lib/types";
import { CardThumb } from "./CardThumb";
import { ManaCost, ColorIdentityPips } from "./ManaCost";

interface Props {
  deck: Deck;
  onInspect: (card: Card) => void;
}

export function CardSearch({ deck, onInspect }: Props) {
  const { addCard } = useDeckStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restrictColor, setRestrictColor] = useState(true);
  const [type, setType] = useState("");
  const debounce = useRef<number | null>(null);

  const commander = deck.commanderId ? deck.entries[deck.commanderId]?.card : undefined;
  const partner = deck.partnerId ? deck.entries[deck.partnerId]?.card : undefined;
  const allowed = commanderColorIdentity(commander, partner);

  async function run(q: string) {
    if (!q.trim() && !type) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const parts: string[] = [];
      if (q.trim()) parts.push(q.trim());
      if (type) parts.push(`t:${type}`);
      if (restrictColor && commander) {
        parts.push(`id<=${colorIdentityString(allowed).toLowerCase() || "c"}`);
      }
      parts.push("legal:commander");
      const list = await scryfall.searchCards(parts.join(" "), { order: "edhrec" });
      setResults(list.data.slice(0, 60));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function onChange(text: string) {
    setQuery(text);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void run(text), 300);
  }

  useEffect(() => {
    void run(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, restrictColor]);

  function add(c: Card) {
    if (commander && !withinColorIdentity(c, allowed)) {
      const offending = c.color_identity.filter((x) => !allowed.has(x)).join("");
      if (!confirm(`${c.name} is outside your commander's color identity (${offending}). Add anyway?`)) return;
    }
    if (deck.entries[c.id]) {
      // singleton — only basic lands or "any number" cards may stack; handled in store.
    }
    addCard(deck.id, c, 1);
  }

  return (
    <div className="panel p-3 flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          placeholder="Search any card by name, text, or Scryfall syntax (e.g. o:'destroy target' cmc<=3)"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-[200px] bg-bg-raised border border-bg-border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500/60 text-sm"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-bg-raised border border-bg-border rounded px-2 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="creature">Creature</option>
          <option value="instant">Instant</option>
          <option value="sorcery">Sorcery</option>
          <option value="artifact">Artifact</option>
          <option value="enchantment">Enchantment</option>
          <option value="planeswalker">Planeswalker</option>
          <option value="battle">Battle</option>
          <option value="land">Land</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={restrictColor}
            onChange={(e) => setRestrictColor(e.target.checked)}
          />
          Restrict to commander&rsquo;s color identity
        </label>
      </div>

      {loading && <div className="text-xs text-amber-400 mb-2">Searching Scryfall…</div>}
      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

      <div className="flex-1 overflow-y-auto pr-1">
        {results.length === 0 && !loading && (
          <div className="text-zinc-500 text-sm p-6 text-center">
            Type to search the live Scryfall card database. Press a card to add it.
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {results.map((c) => (
            <div key={c.id} className="space-y-1">
              <CardThumb card={c} onClick={() => onInspect(c)} />
              <div className="text-[11px]">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold truncate" title={c.name}>{c.name}</span>
                  <ManaCost cost={c.mana_cost} />
                </div>
                <div className="text-zinc-400 truncate">{c.type_line}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <ColorIdentityPips colors={c.color_identity} />
                  {c.prices.usd && <span className="text-emerald-400">${c.prices.usd}</span>}
                </div>
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => add(c)}
                    className="btn btn-primary text-[11px] px-2 py-1 flex-1 justify-center"
                  >
                    + Add
                  </button>
                  <button onClick={() => onInspect(c)} className="btn btn-ghost text-[11px] px-2 py-1">
                    Info
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
