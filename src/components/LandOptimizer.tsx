"use client";

import { useState } from "react";
import type { Card, Deck } from "@/lib/types";
import { optimizeLands } from "@/lib/lands";
import { useDeckStore } from "@/lib/store";
import { totalCards, landCount } from "@/lib/analytics";
import { frontImage } from "@/lib/scryfall";

interface Props {
  deck: Deck;
  onInspect: (c: Card) => void;
}

interface PendingPlan {
  mode: "budget" | "rich";
  landsToAdd: { card: Card; reason: string }[];
  landsToRemove: string[];
}

export function LandOptimizer({ deck, onInspect }: Props) {
  const { addCard, removeCard } = useDeckStore();
  const [loading, setLoading] = useState<"budget" | "rich" | null>(null);
  const [plan, setPlan] = useState<PendingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = totalCards(deck);
  const lands = landCount(deck);
  const hasCommander = !!deck.commanderId;

  async function run(mode: "budget" | "rich") {
    if (!hasCommander) return;
    setLoading(mode);
    setError(null);
    setPlan(null);
    try {
      const result = await optimizeLands(deck, mode);
      setPlan({
        mode,
        landsToAdd: result.landsToAdd,
        landsToRemove: result.landsToRemove,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to optimize lands");
    } finally {
      setLoading(null);
    }
  }

  function applyPlan() {
    if (!plan) return;
    // Remove existing lands
    for (const id of plan.landsToRemove) {
      removeCard(deck.id, id);
    }
    // Add new lands
    for (const { card, reason } of plan.landsToAdd) {
      const match = reason.match(/(\d+)x for/);
      const qty = match ? parseInt(match[1], 10) : 1;
      addCard(deck.id, card, qty);
    }
    setPlan(null);
  }

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm text-amber-400">Land Base</h3>
        <span className="text-[10px] text-zinc-500">{lands} lands / {total} cards</span>
      </div>

      {!hasCommander && (
        <p className="text-xs text-zinc-500">Pick a commander first to optimize lands.</p>
      )}

      {hasCommander && !plan && (
        <div className="flex gap-2">
          <button
            onClick={() => run("budget")}
            disabled={loading !== null}
            className="btn btn-primary flex-1 justify-center text-xs"
          >
            {loading === "budget" ? "Brewing..." : "Optimize Lands"}
          </button>
          <button
            onClick={() => run("rich")}
            disabled={loading !== null}
            className="btn flex-1 justify-center text-xs bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 text-black font-bold hover:from-yellow-400 hover:to-yellow-400 border-0"
            title="Add fetch lands, original duals, Gaea's Cradle, and other premium lands"
          >
            {loading === "rich" ? "Counting stacks..." : "I'm Rich"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {plan && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-300">
              {plan.mode === "rich" ? "Premium" : "Optimized"} mana base
            </span>
            <span className="text-[10px] text-zinc-500">
              {plan.landsToRemove.length > 0
                ? `Replacing ${plan.landsToRemove.length} lands`
                : `Adding ${plan.landsToAdd.length} lands`}
            </span>
          </div>

          {plan.landsToRemove.length > 0 && (
            <div className="text-[10px] text-red-400 bg-red-900/20 rounded p-2">
              Removing: {plan.landsToRemove.map((id) => deck.entries[id]?.card.name).filter(Boolean).join(", ")}
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-1">
            {plan.landsToAdd.map((l, i) => (
              <div
                key={`${l.card.id}-${i}`}
                className="flex items-center gap-2 text-xs bg-bg-raised rounded px-2 py-1 hover:bg-bg-border transition cursor-pointer"
                onClick={() => onInspect(l.card)}
              >
                {frontImage(l.card, "small") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frontImage(l.card, "small")}
                    alt={l.card.name}
                    className="w-8 h-8 rounded object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-bg-border" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.card.name}</div>
                  <div className="text-[10px] text-zinc-500">{l.reason}</div>
                </div>
                {l.card.prices.usd && (
                  <span className="text-emerald-400 text-[10px]">${l.card.prices.usd}</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={applyPlan}
              className={`btn flex-1 justify-center text-xs ${
                plan.mode === "rich"
                  ? "bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 text-black font-bold border-0"
                  : "btn-primary"
              }`}
            >
              {plan.mode === "rich" ? "Apply (ka-ching)" : "Apply Land Base"}
            </button>
            <button
              onClick={() => setPlan(null)}
              className="btn btn-ghost text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
