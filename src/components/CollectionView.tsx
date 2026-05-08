"use client";

// The /collection page: lets the user browse, filter, search, and edit
// their card collection. Filters are local except for the Scryfall-syntax
// search, which goes through Scryfall's /cards/search endpoint and then
// intersects with the collection by card.id (so the user sees only what
// they own that matches the syntax).

import { useEffect, useMemo, useState } from "react";
import {
  collectionStats,
  useDeckStore,
  type CollectionEntry,
} from "@/lib/store";
import type { Card } from "@/lib/types";
import { scryfall, frontImage } from "@/lib/scryfall";
import { CardDetail } from "./CardDetail";
import { CardHoverLayer, hoverProps, useCardHover } from "./CardHoverPreview";
import { ManaCost, ColorIdentityPips } from "./ManaCost";
import { ConfirmDialog } from "./ConfirmDialog";

type SortMode = "name" | "value" | "set" | "added";

const COLORS = ["W", "U", "B", "R", "G"] as const;

export function CollectionView() {
  const collection = useDeckStore((s) => s.collection);
  const { addToCollection, removeFromCollection, setCollectionQuantity, clearCollection } =
    useDeckStore();
  const stats = useMemo(() => collectionStats(collection), [collection]);
  const allEntries = useMemo(() => Object.values(collection), [collection]);

  // ---- Local filters ----
  const [nameQuery, setNameQuery] = useState("");
  const [scryfallQuery, setScryfallQuery] = useState("");
  const [scryfallIds, setScryfallIds] = useState<Set<string> | null>(null);
  const [scryfallLoading, setScryfallLoading] = useState(false);
  const [scryfallError, setScryfallError] = useState<string | null>(null);
  const [setFilter, setSetFilter] = useState<string>("All");
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");
  const [sort, setSort] = useState<SortMode>("name");
  const [inspect, setInspect] = useState<Card | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const hover = useCardHover();

  // Distinct sets present in the collection — feeds the Set filter dropdown.
  const setsInCollection = useMemo(() => {
    const m = new Map<string, string>(); // code -> name
    for (const e of allEntries) {
      m.set(e.card.set.toUpperCase(), e.card.set_name ?? e.card.set.toUpperCase());
    }
    return Array.from(m.entries()).sort(([, a], [, b]) => a.localeCompare(b));
  }, [allEntries]);

  // ---- Run Scryfall search when scryfallQuery changes (debounced) ----
  useEffect(() => {
    if (!scryfallQuery.trim()) {
      setScryfallIds(null);
      setScryfallError(null);
      return;
    }
    const t = window.setTimeout(async () => {
      setScryfallLoading(true);
      setScryfallError(null);
      try {
        const list = await scryfall.searchCards(scryfallQuery.trim(), { order: "name" });
        const ids = new Set(list.data.map((c) => c.id));
        setScryfallIds(ids);
      } catch (e) {
        setScryfallError(e instanceof Error ? e.message : "Scryfall query failed");
        setScryfallIds(new Set()); // fail closed: nothing matches
      } finally {
        setScryfallLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [scryfallQuery]);

  const visible = useMemo(() => {
    const min = parseFloat(minValue);
    const max = parseFloat(maxValue);
    let out = allEntries;
    if (nameQuery.trim()) {
      const q = nameQuery.trim().toLowerCase();
      out = out.filter((e) => e.card.name.toLowerCase().includes(q));
    }
    if (scryfallIds !== null) {
      out = out.filter((e) => scryfallIds.has(e.card.id));
    }
    if (setFilter !== "All") {
      out = out.filter((e) => e.card.set.toUpperCase() === setFilter);
    }
    if (colorFilter.length > 0) {
      out = out.filter((e) =>
        colorFilter.every((c) => e.card.color_identity.includes(c as Card["color_identity"][number])),
      );
    }
    if (!Number.isNaN(min)) {
      out = out.filter((e) => parseFloat(e.card.prices?.usd ?? "0") >= min);
    }
    if (!Number.isNaN(max)) {
      out = out.filter((e) => parseFloat(e.card.prices?.usd ?? "0") <= max);
    }
    if (sort === "name") out = [...out].sort((a, b) => a.card.name.localeCompare(b.card.name));
    else if (sort === "value")
      out = [...out].sort(
        (a, b) => parseFloat(b.card.prices?.usd ?? "0") - parseFloat(a.card.prices?.usd ?? "0"),
      );
    else if (sort === "set")
      out = [...out].sort(
        (a, b) =>
          (a.card.set_name ?? a.card.set).localeCompare(b.card.set_name ?? b.card.set) ||
          a.card.name.localeCompare(b.card.name),
      );
    else if (sort === "added") out = [...out].sort((a, b) => b.acquiredAt - a.acquiredAt);
    return out;
  }, [allEntries, nameQuery, scryfallIds, setFilter, colorFilter, minValue, maxValue, sort]);

  function toggleColor(c: string) {
    setColorFilter((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6 space-y-5">
      {/* Stats hero */}
      <section className="panel p-5">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
              Your Collection
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Stored locally in your browser. Add cards from the search panel or any card&rsquo;s detail view.
            </p>
          </div>
          <div className="flex items-stretch gap-2">
            <StatTile label="Unique" value={stats.uniqueCards.toLocaleString()} />
            <StatTile label="Total cards" value={stats.totalCards.toLocaleString()} />
            <StatTile
              label="Est. value"
              value={`$${stats.estimatedValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              accent="emerald"
            />
            {allEntries.length > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                className="btn btn-ghost text-xs self-end hover:!text-red-400"
                title="Remove every card from your collection"
              >
                Clear collection
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Filter by name…"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            className="flex-1 min-w-[200px] bg-bg-raised border border-bg-border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/60"
          />
          <input
            type="search"
            placeholder='Scryfall syntax (e.g. t:creature pow>=4 c:b)'
            value={scryfallQuery}
            onChange={(e) => setScryfallQuery(e.target.value)}
            className="flex-1 min-w-[260px] bg-bg-raised border border-bg-border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/60 font-mono"
            title="Filters your collection to only the cards that match this Scryfall search"
          />
          {scryfallLoading && <span className="text-xs text-amber-400">Searching…</span>}
        </div>
        {scryfallError && (
          <div className="text-xs text-red-400">Scryfall: {scryfallError}</div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-zinc-400">Set</span>
            <select
              value={setFilter}
              onChange={(e) => setSetFilter(e.target.value)}
              className="bg-bg-raised border border-bg-border rounded px-2 py-1"
            >
              <option value="All">All ({setsInCollection.length})</option>
              {setsInCollection.map(([code, name]) => (
                <option key={code} value={code}>
                  {name} · {code}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1">
            <span className="text-zinc-400">Color</span>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => toggleColor(c)}
                className={`mana-symbol mana-${c} ${
                  colorFilter.includes(c) ? "ring-2 ring-amber-400" : "opacity-60 hover:opacity-100"
                }`}
                style={{ width: "1.4em", height: "1.4em", fontSize: "0.85em" }}
                title={`Filter by ${c}`}
              >
                {c}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1">
            <span className="text-zinc-400">Value</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="min"
              value={minValue}
              onChange={(e) => setMinValue(e.target.value)}
              className="w-20 bg-bg-raised border border-bg-border rounded px-1.5 py-1 text-xs"
            />
            <span className="text-zinc-500">–</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="max"
              value={maxValue}
              onChange={(e) => setMaxValue(e.target.value)}
              className="w-20 bg-bg-raised border border-bg-border rounded px-1.5 py-1 text-xs"
            />
          </label>

          <label className="flex items-center gap-1 ml-auto">
            <span className="text-zinc-400">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="bg-bg-raised border border-bg-border rounded px-2 py-1"
            >
              <option value="name">Name</option>
              <option value="value">Value (high → low)</option>
              <option value="set">Set</option>
              <option value="added">Recently added</option>
            </select>
          </label>

          <span className="text-[10px] text-zinc-500">{visible.length} shown</span>
        </div>
      </section>

      {/* Grid */}
      <section>
        {allEntries.length === 0 ? (
          <div className="panel p-12 text-center text-zinc-400">
            <div className="text-5xl mb-3">📦</div>
            <h3 className="font-display text-xl text-amber-300 mb-1">Your collection is empty</h3>
            <p className="text-sm">
              Add cards from the search panel on the build page, or from any card&rsquo;s detail view.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="panel p-12 text-center text-zinc-500 text-sm">
            No cards match these filters. Try widening the criteria.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {visible.map((entry) => (
              <CollectionCard
                key={entry.cardId}
                entry={entry}
                onInspect={(c) => setInspect(c)}
                onIncrement={(foil) => addToCollection(entry.card, 1, foil)}
                onDecrement={(foil) => removeFromCollection(entry.cardId, 1, foil)}
                onSetQuantity={(qty, foil) => setCollectionQuantity(entry.cardId, qty, foil)}
                hoverProps={hoverProps(entry.card, hover)}
              />
            ))}
          </div>
        )}
      </section>

      {inspect && <CardDetail card={inspect} onClose={() => setInspect(null)} />}

      <ConfirmDialog
        open={confirmClear}
        title="Clear entire collection?"
        message="Every card and quantity will be removed. This cannot be undone."
        confirmLabel="Clear"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          clearCollection();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <CardHoverLayer hover={hover} />
    </div>
  );
}

function StatTile({
  label,
  value,
  accent = "amber",
}: {
  label: string;
  value: string;
  accent?: "amber" | "emerald";
}) {
  const valueColor = accent === "emerald" ? "text-emerald-300" : "text-amber-300";
  return (
    <div className="rounded-md border border-bg-border bg-bg-raised px-3 py-1.5 text-right">
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`font-mono text-base leading-tight ${valueColor}`}>{value}</div>
    </div>
  );
}

function CollectionCard({
  entry,
  onInspect,
  onIncrement,
  onDecrement,
  onSetQuantity,
  hoverProps,
}: {
  entry: CollectionEntry;
  onInspect: (c: Card) => void;
  onIncrement: (foil: boolean) => void;
  onDecrement: (foil: boolean) => void;
  onSetQuantity: (qty: number, foil: boolean) => void;
  hoverProps: React.HTMLAttributes<HTMLElement>;
}) {
  const img = frontImage(entry.card, "normal");
  const usd = parseFloat(entry.card.prices?.usd ?? "0") || 0;
  const usdFoil = parseFloat(entry.card.prices?.usd_foil ?? entry.card.prices?.usd ?? "0") || 0;
  const totalValue = entry.quantity * usd + entry.foilQuantity * usdFoil;
  return (
    <article {...hoverProps} className="panel overflow-hidden flex flex-col">
      <button onClick={() => onInspect(entry.card)} className="block w-full text-left">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={entry.card.name} className="w-full block" loading="lazy" draggable={false} />
        ) : (
          <div className="aspect-[5/7] bg-bg-raised flex items-center justify-center text-xs p-2 text-center">
            {entry.card.name}
          </div>
        )}
      </button>
      <div className="p-2 text-xs space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold truncate" title={entry.card.name}>{entry.card.name}</span>
          <ManaCost cost={entry.card.mana_cost} />
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
          <ColorIdentityPips colors={entry.card.color_identity} />
          <span className="truncate">{entry.card.set_name ?? entry.card.set.toUpperCase()}</span>
          {totalValue > 0 && (
            <span className="ml-auto text-emerald-400">${totalValue.toFixed(2)}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1 pt-1">
          <QtyControl
            label="Reg"
            quantity={entry.quantity}
            onMinus={() => onDecrement(false)}
            onPlus={() => onIncrement(false)}
            onSet={(q) => onSetQuantity(q, false)}
          />
          <QtyControl
            label="Foil"
            quantity={entry.foilQuantity}
            onMinus={() => onDecrement(true)}
            onPlus={() => onIncrement(true)}
            onSet={(q) => onSetQuantity(q, true)}
            accent="amber"
          />
        </div>
      </div>
    </article>
  );
}

function QtyControl({
  label,
  quantity,
  onMinus,
  onPlus,
  onSet,
  accent,
}: {
  label: string;
  quantity: number;
  onMinus: () => void;
  onPlus: () => void;
  onSet: (q: number) => void;
  accent?: "amber";
}) {
  const valueClass = accent === "amber"
    ? quantity > 0 ? "text-amber-300" : "text-zinc-500"
    : quantity > 0 ? "text-zinc-100" : "text-zinc-500";
  return (
    <div className="flex items-center gap-1 bg-bg-raised border border-bg-border rounded px-1 py-0.5">
      <span className="text-[9px] uppercase tracking-wider text-zinc-500 w-6">{label}</span>
      <button
        onClick={onMinus}
        disabled={quantity === 0}
        className="text-zinc-400 hover:text-red-400 disabled:opacity-30 px-1"
        aria-label={`Decrease ${label} quantity`}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={99}
        value={quantity}
        onChange={(e) => onSet(Math.max(0, Number(e.target.value) || 0))}
        className={`w-8 bg-transparent text-center font-mono text-xs ${valueClass} outline-none`}
      />
      <button
        onClick={onPlus}
        className="text-zinc-400 hover:text-emerald-400 px-1"
        aria-label={`Increase ${label} quantity`}
      >
        +
      </button>
    </div>
  );
}
