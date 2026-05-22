"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { scryfall } from "@/lib/scryfall";
import { searchCommanders } from "@/lib/recommend";
import { canBeCommander } from "@/lib/commander-rules";
import { useDeckStore } from "@/lib/store";
import { seedNewDeckStaples } from "@/lib/lands";
import { CardThumb } from "./CardThumb";
import { ManaCost, ColorIdentityPips } from "./ManaCost";
import { CardHoverLayer, hoverProps, useCardHover } from "./CardHoverPreview";
import { ConfirmDialog } from "./ConfirmDialog";
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
  const params = useSearchParams();
  // Intent flag: ?replace=<deckId> means the user came from the
  // CommanderBanner "Change" button on a specific deck. Without it,
  // picking a commander either fills in an empty active deck or
  // creates a new deck — never silently overwrites an existing
  // commander on a deck the user has been working on.
  const replaceDeckId = params?.get("replace") ?? null;

  const { activeDeckId, createDeck, setCommander, setActiveDeck } = useDeckStore();
  const decks = useDeckStore((s) => s.decks);
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [results, setResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  const [pendingReplace, setPendingReplace] = useState<Card | null>(null);
  // Tracks how long the initial load has been spinning. Drives the
  // multi-phase progress message so the user understands the app is
  // actually doing something rather than stuck. Reset whenever a
  // search starts.
  const [loadPhase, setLoadPhase] = useState<"initial" | "slow" | "timeout">("initial");
  const hover = useCardHover();
  const debounce = useRef<number | null>(null);

  const replaceTarget = replaceDeckId ? decks[replaceDeckId] : null;

  // Run an initial "popular commanders" search so the page isn't empty.
  useEffect(() => {
    void runSearch("");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function buildQuery(text: string, cs: string[]): string {
    const parts: string[] = [];
    const trimmed = text.trim();
    if (trimmed) {
      // Scryfall treats bare words as a name match. That breaks
      // theme-style searches like "tokens", "lifegain", or "voltron"
      // — the user expects the picker to surface commanders that
      // *do* those things, not commanders whose name contains that
      // word. If the user's input has no Scryfall operators (`:` /
      // `>=` / `<=` / explicit quoting), expand it to also match
      // oracle text and types so themes, keywords, and creature
      // types all hit.
      const hasOperator = /[:<>="]/.test(trimmed);
      if (hasOperator) {
        parts.push(trimmed);
      } else {
        // Quote individual words so multi-word inputs ("group hug")
        // still match as phrases inside oracle/name/type fields.
        const tokens = trimmed.split(/\s+/);
        const expansions = tokens.map((t) => {
          const safe = t.replace(/"/g, "");
          return `(name:"${safe}" or o:"${safe}" or t:"${safe}" or keyword:"${safe}")`;
        });
        parts.push(expansions.join(" "));
      }
    }
    if (cs.length > 0) parts.push(`id<=${cs.join("").toLowerCase()}`);
    else if (trimmed === "") parts.push("is:commander"); // popular default
    return parts.join(" ");
  }

  async function runSearch(text: string, cs = colors) {
    setLoading(true);
    setError(null);
    setLoadPhase("initial");
    // Tier the progress message: 8s = "still loading"; 25s = surface
    // a retry hint. The timers fire as side effects only; if the
    // search completes earlier they're cleared in `finally`.
    const slowTimer = window.setTimeout(() => setLoadPhase("slow"), 8000);
    const timeoutTimer = window.setTimeout(() => setLoadPhase("timeout"), 25000);
    try {
      const q = buildQuery(text, cs);
      const cards = await searchCommanders(q, 30);
      setResults(cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      window.clearTimeout(slowTimer);
      window.clearTimeout(timeoutTimer);
      setLoading(false);
      setLoadPhase("initial");
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

  // Apply a commander pick to a specific deck — assigns the commander,
  // auto-names placeholder decks, fire-and-forget seeds Sol Ring +
  // Arcane Signet for new decks, then navigates to /build.
  function applyToDeck(deckId: string, card: Card) {
    const deck = useDeckStore.getState().decks[deckId];
    if (deck && /^(Untitled Deck|New Deck)$/i.test(deck.name)) {
      useDeckStore.getState().renameDeck(deckId, card.name);
    }
    setCommander(deckId, card);
    setActiveDeck(deckId);
    const fresh = useDeckStore.getState().decks[deckId];
    if (fresh) {
      void seedNewDeckStaples(fresh, (c) => useDeckStore.getState().addCard(deckId, c));
    }
    router.push("/build");
  }

  async function pick(card: Card) {
    if (!canBeCommander(card)) return;

    // Path 1 — explicit replace flow: came from CommanderBanner "Change"
    // button on a specific deck. Confirm before overwriting.
    if (replaceDeckId && decks[replaceDeckId]) {
      setPendingReplace(card);
      return;
    }

    // Path 2 — fill an empty active deck. This covers the new-deck
    // flows (Header "+ New Deck", DeckLibrary "+ New Deck", empty
    // /build "Choose Commander" button) where a placeholder deck was
    // created upstream and is sitting commander-less.
    const active = activeDeckId ? useDeckStore.getState().decks[activeDeckId] : undefined;
    if (active && !active.commanderId) {
      applyToDeck(active.id, card);
      return;
    }

    // Path 3 — no active deck OR active deck already has a commander.
    // Either way, the user landed here via a non-replace path, so
    // creating a new deck is the safe default. NEVER silently
    // overwrite a working deck's commander.
    const newId = createDeck(card.name);
    applyToDeck(newId, card);
  }

  function confirmReplace() {
    if (!pendingReplace || !replaceDeckId) return;
    applyToDeck(replaceDeckId, pendingReplace);
    setPendingReplace(null);
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
      {/* In replace mode (came from "Change" button on a deck), show a
          persistent banner so the user knows their pick will overwrite,
          not start a fresh deck. */}
      {replaceTarget && (
        <div className="panel p-3 border-violet-700/40 bg-violet-900/10 flex items-center gap-2 text-sm">
          <span className="text-violet-300">⚠</span>
          <span className="flex-1">
            Replacing the commander on{" "}
            <span className="font-semibold text-violet-300">{replaceTarget.name}</span>.
            Your existing cards stay in the deck; only the commander changes.
          </span>
          <button
            onClick={() => router.push("/build")}
            className="text-xs text-zinc-400 hover:text-violet-300 underline"
          >
            Cancel
          </button>
        </div>
      )}

      <section className="panel p-6">
        <h1 className="font-display text-3xl text-violet-400">
          {replaceTarget ? "Pick a new commander" : "Choose Your Commander"}
        </h1>
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
              className="w-full bg-bg-raised border border-bg-border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500/60"
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
                  colors.includes(c.value) ? "ring-2 ring-violet-400" : "opacity-60 hover:opacity-100"
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
          {loading && (
            <span className="text-xs text-violet-400 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              {loadPhase === "initial" && "Fetching commanders from Scryfall…"}
              {loadPhase === "slow" && "Still loading — this can take a few seconds on first visit."}
              {loadPhase === "timeout" && (
                <>
                  Taking longer than usual.
                  <button
                    onClick={() => void runSearch(query)}
                    className="underline hover:text-violet-300"
                  >
                    Retry
                  </button>
                </>
              )}
            </span>
          )}
        </div>
        {error && (
          <div className="panel p-4 text-red-400 text-sm flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              onClick={() => void runSearch(query)}
              className="text-xs underline hover:text-red-200"
            >
              Try again
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map((c) => (
            <div key={c.id} {...hoverProps(c, hover)} className="space-y-2">
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

          {/* Skeleton cards during the initial fetch. Same grid cell
              shape as a real result so the layout doesn't jump when
              the data lands. */}
          {loading && results.length === 0 &&
            Array.from({ length: 12 }).map((_, i) => <CommanderSkeleton key={`sk-${i}`} />)}

          {!loading && results.length === 0 && !error && (
            <div className="col-span-full text-center text-zinc-500 py-12">
              No commanders match. Try a different name or color combination.
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={pendingReplace !== null}
        title="Replace commander?"
        message={
          pendingReplace && replaceTarget
            ? `${replaceTarget.name} currently runs ${
                replaceTarget.commanderId
                  ? replaceTarget.entries[replaceTarget.commanderId]?.card.name ?? "a commander"
                  : "no commander"
              }. Switching to ${pendingReplace.name} keeps the rest of your deck intact, but cards outside the new color identity will become illegal until removed.`
            : ""
        }
        confirmLabel="Replace"
        cancelLabel="Keep current"
        destructive
        onConfirm={confirmReplace}
        onCancel={() => setPendingReplace(null)}
      />

      <CardHoverLayer hover={hover} />
    </div>
  );
}

// Placeholder card shown in the grid while the initial search is in
// flight. Same outer shape as a real result tile so the grid doesn't
// reflow when the data arrives.
function CommanderSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="aspect-[5/7] rounded-lg bg-bg-raised border border-bg-border" />
      <div className="space-y-1">
        <div className="h-3 bg-bg-raised rounded w-3/4" />
        <div className="h-2 bg-bg-raised rounded w-1/2" />
        <div className="h-7 bg-bg-raised rounded mt-1" />
      </div>
    </div>
  );
}
