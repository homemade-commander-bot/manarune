"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, Deck, DeckEntry } from "@/lib/types";
import { commanderRecommendations, type Recommendation } from "@/lib/recommend";
import { useDeckStore } from "@/lib/store";
import { frontImage } from "@/lib/scryfall";
import { totalCards, deckEntries } from "@/lib/analytics";
import { suggestCut } from "@/lib/lands";
import { comboPartnersInDeck } from "@/lib/brackets";
import { ManaCost, ColorIdentityPips } from "./ManaCost";

interface Props {
  deck: Deck;
  onInspect: (c: Card) => void;
}

const SWIPE_THRESHOLD = 110; // px

interface SwapPrompt {
  incoming: Recommendation;
  suggestedCut: DeckEntry;
}

export function SwipeFeed({ deck, onInspect }: Props) {
  const { addCard, removeCard } = useDeckStore();
  const commander = deck.commanderId ? deck.entries[deck.commanderId]?.card : undefined;
  const partner = deck.partnerId ? deck.entries[deck.partnerId]?.card : undefined;
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<{ rec: Recommendation; action: "add" | "skip" }[]>([]);
  const [synergyOnly, setSynergyOnly] = useState(true);
  const [swapPrompt, setSwapPrompt] = useState<SwapPrompt | null>(null);

  // Drag state
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const animatingRef = useRef(false);

  // Load recs on commander change. Reset queue.
  useEffect(() => {
    if (!commander) {
      setRecs([]);
      return;
    }
    setLoading(true);
    setError(null);
    commanderRecommendations(commander, partner, { max: 200 })
      .then((r) => {
        setRecs(r);
        setIndex(0);
        setHistory([]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load recommendations"))
      .finally(() => setLoading(false));
  }, [commander?.id, partner?.id]);

  // Filter: skip cards already in the deck or below synergy threshold (if enabled)
  const queue = useMemo(() => {
    let out = recs.filter((r) => !deck.entries[r.card.id]);
    if (synergyOnly) {
      // Keep cards with EDHREC synergy >= 5%, or fall back to those without a synergy field (theme/staple) if EDHREC was unreachable.
      const haveAnySynergy = out.some((r) => typeof r.synergy === "number");
      if (haveAnySynergy) {
        out = out.filter((r) => (r.synergy ?? 0) >= 0.05 || r.source !== "edhrec");
      }
    }
    return out;
  }, [recs, deck.entries, synergyOnly]);

  const current = queue[index];
  const next = queue[index + 1];
  const remaining = Math.max(0, queue.length - index);
  const currentComboPartners = useMemo(
    () => (current ? comboPartnersInDeck(current.card, deck) : []),
    [current, deck],
  );
  const nextComboPartners = useMemo(
    () => (next ? comboPartnersInDeck(next.card, deck) : []),
    [next, deck],
  );

  const commit = useCallback((action: "add" | "skip") => {
    if (!current || animatingRef.current) return;

    // If adding and deck is full, show swap prompt instead
    if (action === "add" && totalCards(deck) >= 100) {
      const cut = suggestCut(deck);
      if (cut) {
        setSwapPrompt({ incoming: current, suggestedCut: cut });
        return;
      }
    }

    animatingRef.current = true;
    if (action === "add") addCard(deck.id, current.card);
    setHistory((h) => [...h, { rec: current, action }]);
    const dx = action === "add" ? window.innerWidth : -window.innerWidth;
    setDrag({ x: dx, y: 0 });
    setTimeout(() => {
      setIndex((i) => i + 1);
      setDrag(null);
      animatingRef.current = false;
    }, 220);
  }, [current, addCard, deck, deck.id]);

  const undo = useCallback(() => {
    if (history.length === 0 || animatingRef.current) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
    if (last.action === "add") {
      useDeckStore.getState().removeCard(deck.id, last.rec.card.id);
    }
  }, [history, deck.id]);

  function executeSwap(cutCardId: string) {
    if (!swapPrompt) return;
    removeCard(deck.id, cutCardId);
    addCard(deck.id, swapPrompt.incoming.card);
    setHistory((h) => [...h, { rec: swapPrompt.incoming, action: "add" }]);
    setSwapPrompt(null);
    animatingRef.current = true;
    setDrag({ x: window.innerWidth, y: 0 });
    setTimeout(() => {
      setIndex((i) => i + 1);
      setDrag(null);
      animatingRef.current = false;
    }, 220);
  }

  function cancelSwap() {
    setSwapPrompt(null);
  }

  // Pointer handlers — single source for mouse + touch via Pointer Events.
  function onPointerDown(e: React.PointerEvent) {
    if (animatingRef.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0 });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
  }
  function onPointerUp() {
    if (!startRef.current || !drag) {
      startRef.current = null;
      setDrag(null);
      return;
    }
    const { x } = drag;
    startRef.current = null;
    if (x > SWIPE_THRESHOLD) commit("add");
    else if (x < -SWIPE_THRESHOLD) commit("skip");
    else setDrag(null);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target && (e.target as HTMLElement).matches("input, textarea, select")) return;
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        commit("add");
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        commit("skip");
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, undo]);

  if (!commander) {
    return (
      <div className="panel p-12 text-center">
        <div className="text-5xl mb-3">🃏</div>
        <h3 className="font-display text-xl text-amber-300 mb-1">Pick a commander to start swiping</h3>
        <p className="text-zinc-400 text-sm">High-synergy recommendations from EDHREC, sized for a thumb.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="panel p-12 text-center">
        <div className="text-zinc-400 text-sm">Drawing your hand…</div>
      </div>
    );
  }

  if (error) {
    return <div className="panel p-4 text-red-400 text-sm">{error}</div>;
  }

  if (!current) {
    return (
      <div className="panel p-12 text-center">
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="font-display text-xl text-amber-300 mb-1">All swiped!</h3>
        <p className="text-zinc-400 text-sm mb-4">
          You&rsquo;ve seen every recommendation in this filter. Switch to the feed view, or relax the synergy filter to see more.
        </p>
        <button onClick={() => setSynergyOnly((v) => !v)} className="btn btn-ghost">
          {synergyOnly ? "Show all recommendations" : "High-synergy only"}
        </button>
      </div>
    );
  }

  const dx = drag?.x ?? 0;
  const dy = drag?.y ?? 0;
  const rot = Math.max(-18, Math.min(18, dx / 14));
  const likeOpacity = Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD));
  const nopeOpacity = Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD));

  return (
    <div className="flex flex-col h-full">
      <div className="panel p-3 mb-3 flex items-center gap-2 flex-wrap">
        <div className="text-xs text-zinc-400">Swiping for</div>
        <div className="font-semibold text-amber-300">{commander.name}</div>
        {partner && <div className="text-zinc-400 text-xs">+ {partner.name}</div>}
        <span className="text-xs text-zinc-500 ml-auto">{remaining} left</span>
        <label className="flex items-center gap-1 text-[11px] text-zinc-300">
          <input
            type="checkbox"
            checked={synergyOnly}
            onChange={(e) => {
              setSynergyOnly(e.target.checked);
              setIndex(0);
            }}
            className="accent-amber-500"
          />
          High-synergy only
        </label>
      </div>

      <div className="flex-1 flex items-center justify-center relative select-none touch-none px-4" style={{ minHeight: 480 }}>
        {/* Skip button — left side, prominent */}
        <button
          onClick={() => commit("skip")}
          className="absolute left-2 sm:left-4 z-20 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white text-3xl shadow-2xl hover:from-red-400 hover:to-red-600 hover:scale-110 active:scale-95 transition-all flex items-center justify-center ring-4 ring-red-500/20 hover:ring-red-400/40"
          title="Skip (← / Backspace)"
          aria-label="Skip card"
        >
          ✕
        </button>

        {/* Add button — right side, prominent */}
        <button
          onClick={() => commit("add")}
          className="absolute right-2 sm:right-4 z-20 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-3xl shadow-2xl hover:from-emerald-300 hover:to-emerald-500 hover:scale-110 active:scale-95 transition-all flex items-center justify-center ring-4 ring-emerald-500/20 hover:ring-emerald-400/40"
          title="Add (→ / Enter)"
          aria-label="Add card to deck"
        >
          ♥
        </button>

        {/* Next card behind */}
        {next && (
          <div className="absolute z-0" style={{ transform: "scale(0.95) translateY(8px)", opacity: 0.5 }}>
            <SwipeCard rec={next} onInspect={onInspect} comboPartners={nextComboPartners} />
          </div>
        )}

        {/* Current card */}
        <div
          role="group"
          aria-label={`Swipe card: ${current.card.name}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative z-10 cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`,
            transition: drag && animatingRef.current ? "transform 220ms ease-out" : drag ? "none" : "transform 200ms ease-out",
            willChange: "transform",
          }}
        >
          <SwipeCard rec={current} onInspect={onInspect} comboPartners={currentComboPartners} />

          {/* Like / Nope stamps */}
          <div
            className="absolute top-6 left-6 px-3 py-1 border-4 border-emerald-400 text-emerald-300 font-display text-2xl rotate-[-18deg] pointer-events-none rounded"
            style={{ opacity: likeOpacity }}
          >
            ADD
          </div>
          <div
            className="absolute top-6 right-6 px-3 py-1 border-4 border-red-400 text-red-300 font-display text-2xl rotate-[18deg] pointer-events-none rounded"
            style={{ opacity: nopeOpacity }}
          >
            SKIP
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mt-3">
        <button
          onClick={undo}
          disabled={history.length === 0}
          className="px-3 py-1.5 rounded-full bg-bg-raised border border-amber-700/40 text-amber-300 text-xs hover:bg-amber-900/20 transition flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo (U)"
          aria-label="Undo last action"
        >
          ↺ Undo
        </button>
        <button
          onClick={() => onInspect(current.card)}
          className="px-3 py-1.5 rounded-full bg-bg-raised border border-zinc-600 text-zinc-300 text-xs hover:bg-bg-border transition flex items-center gap-1"
          title="Inspect"
          aria-label="Inspect card details"
        >
          🔍 Details
        </button>
      </div>

      <div className="text-center text-[10px] text-zinc-500 mt-2">
        Tap{" "}
        <span className="text-red-400">✕</span> to skip, <span className="text-emerald-400">♥</span> to add. Drag, or use{" "}
        <kbd className="px-1 border border-bg-border rounded">←</kbd> /{" "}
        <kbd className="px-1 border border-bg-border rounded">→</kbd> /{" "}
        <kbd className="px-1 border border-bg-border rounded">U</kbd>
      </div>

      {swapPrompt && (
        <SwapModal
          incoming={swapPrompt.incoming}
          suggestedCut={swapPrompt.suggestedCut}
          deck={deck}
          onSwap={executeSwap}
          onSkip={() => { cancelSwap(); commit("skip"); }}
          onCancel={cancelSwap}
          onInspect={onInspect}
        />
      )}
    </div>
  );
}

function SwipeCard({
  rec,
  onInspect,
  comboPartners,
}: {
  rec: Recommendation;
  onInspect: (c: Card) => void;
  comboPartners: string[];
}) {
  const img = frontImage(rec.card, "large");
  const hasCombo = comboPartners.length > 0;
  return (
    <div
      className={`w-[300px] sm:w-[340px] panel overflow-hidden card-shadow relative ${
        hasCombo ? "ring-4 ring-fuchsia-500/70 shadow-fuchsia-500/40" : ""
      }`}
    >
      {hasCombo && (
        <div className="absolute top-2 left-2 right-2 z-10 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white text-[11px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1 animate-pulse">
          <span>🔄 COMBOS WITH</span>
          <span className="font-normal truncate">{comboPartners.join(", ")}</span>
        </div>
      )}
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={rec.card.name} className="w-full block" draggable={false} />
      ) : (
        <div className="aspect-[5/7] bg-bg-raised flex items-center justify-center text-sm p-4 text-center">
          {rec.card.name}
        </div>
      )}
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => onInspect(rec.card)}
            className={`font-semibold truncate hover:text-amber-300 text-left ${hasCombo ? "text-fuchsia-200" : ""}`}
            title={rec.card.name}
          >
            {rec.card.name}
          </button>
          <ManaCost cost={rec.card.mana_cost} />
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
          <ColorIdentityPips colors={rec.card.color_identity} />
          <span className="truncate">{rec.card.type_line.split(" — ")[0]}</span>
          {rec.card.prices.usd && <span className="ml-auto text-emerald-400">${rec.card.prices.usd}</span>}
        </div>
        <div className="text-[10px] text-zinc-400 truncate" title={rec.reason}>
          {rec.reason}
        </div>
      </div>
    </div>
  );
}

function SwapModal({
  incoming,
  suggestedCut,
  deck,
  onSwap,
  onSkip,
  onCancel,
  onInspect,
}: {
  incoming: Recommendation;
  suggestedCut: DeckEntry;
  deck: Deck;
  onSwap: (cutCardId: string) => void;
  onSkip: () => void;
  onCancel: () => void;
  onInspect: (c: Card) => void;
}) {
  const [customPick, setCustomPick] = useState(false);
  const entries = deckEntries(deck).filter(
    (e) => e.cardId !== deck.commanderId && e.cardId !== deck.partnerId,
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="panel max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <h3 className="font-display text-xl text-amber-400">Deck Full (100/100)</h3>
          <p className="text-zinc-400 text-sm mt-1">
            Want to swap a card to make room for <span className="text-amber-300 font-semibold">{incoming.card.name}</span>?
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 text-center">
            <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Remove</div>
            <div
              className="bg-red-900/20 border border-red-800/40 rounded p-2 cursor-pointer hover:border-red-600/60 transition"
              onClick={() => onInspect(suggestedCut.card)}
            >
              {frontImage(suggestedCut.card, "small") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frontImage(suggestedCut.card, "small")!}
                  alt={suggestedCut.card.name}
                  className="w-16 h-16 rounded object-cover mx-auto mb-1"
                />
              )}
              <div className="text-xs font-medium truncate">{suggestedCut.card.name}</div>
              <div className="text-[10px] text-zinc-500">{suggestedCut.card.type_line.split(" — ")[0]}</div>
              <div className="text-[10px] text-zinc-500">CMC {suggestedCut.card.cmc}</div>
            </div>
          </div>

          <div className="text-2xl text-amber-400">→</div>

          <div className="flex-1 text-center">
            <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Add</div>
            <div
              className="bg-emerald-900/20 border border-emerald-800/40 rounded p-2 cursor-pointer hover:border-emerald-600/60 transition"
              onClick={() => onInspect(incoming.card)}
            >
              {frontImage(incoming.card, "small") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frontImage(incoming.card, "small")!}
                  alt={incoming.card.name}
                  className="w-16 h-16 rounded object-cover mx-auto mb-1"
                />
              )}
              <div className="text-xs font-medium truncate">{incoming.card.name}</div>
              <div className="text-[10px] text-zinc-500">{incoming.card.type_line.split(" — ")[0]}</div>
              <div className="text-[10px] text-zinc-500">CMC {incoming.card.cmc}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onSwap(suggestedCut.cardId)}
            className="btn btn-primary flex-1 justify-center"
          >
            Swap
          </button>
          <button onClick={onSkip} className="btn btn-ghost flex-1 justify-center">
            Skip card
          </button>
        </div>

        <button
          onClick={() => setCustomPick((v) => !v)}
          className="text-[11px] text-zinc-400 hover:text-zinc-200 underline w-full text-center"
        >
          {customPick ? "Hide deck list" : "Choose a different card to cut"}
        </button>

        {customPick && (
          <div className="max-h-48 overflow-y-auto border border-bg-border rounded">
            {entries
              .sort((a, b) => b.card.cmc - a.card.cmc || a.card.name.localeCompare(b.card.name))
              .map((e) => (
                <button
                  key={e.cardId}
                  onClick={() => onSwap(e.cardId)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-bg-raised transition text-left"
                >
                  <span className="text-zinc-500 w-6 text-right">{e.card.cmc}</span>
                  <span className="flex-1 truncate">{e.card.name}</span>
                  <span className="text-[10px] text-zinc-500 truncate max-w-[100px]">
                    {e.card.type_line.split(" — ")[0]}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
