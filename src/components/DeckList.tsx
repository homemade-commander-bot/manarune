"use client";

import { useMemo, useState } from "react";
import { useDeckStore } from "@/lib/store";
import { categoryBreakdown, totalCards } from "@/lib/analytics";
import { isUnlimitedQuantity } from "@/lib/commander-rules";
import { findComboPiecesInDeck } from "@/lib/brackets";
import { suggestCut } from "@/lib/lands";
import type { Card, Deck, DeckCategory } from "@/lib/types";
import { ManaCost } from "./ManaCost";
import { CardHoverLayer, hoverProps, useCardHover } from "./CardHoverPreview";
import { dropTargetProps } from "@/lib/dnd";
import { SwapModal } from "./SwapModal";

const ORDER: DeckCategory[] = [
  "Commander",
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Land",
];

export function DeckList({ deck, onInspect }: { deck: Deck; onInspect: (c: Card) => void }) {
  const { addCard, removeCard, setQuantity } = useDeckStore();
  const cats = categoryBreakdown(deck);
  const total = totalCards(deck);
  const comboMap = useMemo(() => findComboPiecesInDeck(deck), [deck]);
  const hasCombos = comboMap.size > 0;
  const hover = useCardHover();
  const [dragHover, setDragHover] = useState(false);
  const [pendingSwap, setPendingSwap] = useState<{ incoming: Card; cut: ReturnType<typeof suggestCut> } | null>(null);

  // Drop handler. If the deck is full, divert into the swap modal
  // instead of silently letting the deck overrun 100/100. If the
  // dropped card is already in the deck or there's no good cut
  // candidate, fall back to a plain addCard (the store-level
  // singleton check then no-ops on duplicates).
  function handleDrop(card: Card) {
    if (deck.entries[card.id]) return; // already in deck — no-op
    if (totalCards(deck) >= 100) {
      const cut = suggestCut(deck);
      if (cut) {
        setPendingSwap({ incoming: card, cut });
        return;
      }
    }
    addCard(deck.id, card);
  }

  const dropProps = dropTargetProps(handleDrop, {
    onDragEnter: () => setDragHover(true),
    onDragLeave: () => setDragHover(false),
  });

  return (
    <div
      {...dropProps}
      className={`panel p-3 flex flex-col h-full transition-colors ${
        dragHover ? "ring-2 ring-emerald-500 bg-emerald-950/10" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg text-violet-400">{deck.name}</h2>
        <span className={`text-sm ${total === 100 ? "text-emerald-400" : "text-zinc-400"}`}>
          {total} / 100
        </span>
      </div>

      {hasCombos && (
        <div className="mb-2 rounded border border-fuchsia-700/40 bg-fuchsia-900/20 px-2 py-1 text-[10px] text-fuchsia-200">
          <span className="font-semibold">🔄 {comboMap.size} combo piece{comboMap.size === 1 ? "" : "s"} live</span>
          <span className="text-fuchsia-300/70"> — highlighted below</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-1 text-sm">
        {ORDER.map((cat) => {
          const items = cats[cat];
          if (!items.length) return null;
          const count = items.reduce((s, e) => s + e.quantity, 0);
          return (
            <div key={cat} className="mb-3">
              <div className="text-xs uppercase tracking-wider text-zinc-400 mb-1 sticky top-0 bg-bg-panel py-1 z-10">
                {cat} <span className="text-zinc-500">({count})</span>
              </div>
              <ul className="space-y-1">
                {items.map((e) => {
                  const isCmd = e.cardId === deck.commanderId || e.cardId === deck.partnerId;
                  const comboPartners = comboMap.get(e.card.name);
                  const isCombo = !!comboPartners;
                  return (
                    <li
                      key={e.cardId}
                      className={`flex items-center gap-2 px-1.5 py-1 rounded group transition-colors ${
                        isCombo
                          ? "bg-fuchsia-950/30 border-l-2 border-fuchsia-500 hover:bg-fuchsia-900/30"
                          : "hover:bg-bg-raised"
                      }`}
                      title={isCombo ? `Combos with: ${comboPartners!.join(", ")}` : undefined}
                    >
                      {isUnlimitedQuantity(e.card) ? (
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={e.quantity}
                          onChange={(ev) => setQuantity(deck.id, e.cardId, Number(ev.target.value) || 0)}
                          className="w-12 bg-bg-raised border border-bg-border rounded text-xs px-1 py-0.5"
                        />
                      ) : (
                        <span className="w-6 text-center text-zinc-500 text-xs">1</span>
                      )}
                      <button
                        {...hoverProps(e.card, hover)}
                        className={`flex-1 text-left truncate hover:text-violet-300 ${isCombo ? "text-fuchsia-200 font-medium" : ""}`}
                        onClick={() => onInspect(e.card)}
                        title={e.card.oracle_text || e.card.name}
                      >
                        {e.card.name}
                      </button>
                      <ManaCost cost={e.card.mana_cost} />
                      {isCombo && (
                        <span
                          className="chip text-[9px] text-fuchsia-300 border-fuchsia-600/50 bg-fuchsia-900/30"
                          title={`Combos with: ${comboPartners!.join(", ")}`}
                        >
                          🔄 COMBO
                        </span>
                      )}
                      {isCmd && (
                        <span className="chip text-[10px] text-violet-400 border-violet-700/40">CMDR</span>
                      )}
                      {!isCmd && (
                        <button
                          onClick={() => removeCard(deck.id, e.cardId)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 text-xs"
                          title="Remove"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {Object.values(cats).every((v) => v.length === 0) && (
          <div className="text-zinc-500 text-center py-10 text-sm">
            No cards yet. Pick a commander, then add cards from the search panel
            <span className="text-zinc-400"> or drag any card from the feed onto this list.</span>
          </div>
        )}
      </div>

      <CardHoverLayer hover={hover} />

      {pendingSwap && pendingSwap.cut && (
        <SwapModal
          incomingCard={pendingSwap.incoming}
          suggestedCut={pendingSwap.cut}
          deck={deck}
          onSwap={(cutCardId) => {
            removeCard(deck.id, cutCardId);
            addCard(deck.id, pendingSwap.incoming);
            setPendingSwap(null);
          }}
          onSkip={() => setPendingSwap(null)}
          onCancel={() => setPendingSwap(null)}
          onInspect={onInspect}
        />
      )}
    </div>
  );
}
