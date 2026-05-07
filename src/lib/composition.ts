// Deck-composition targets and deficit calculations.
//
// Used by the SwipeFeed to bias recommendations toward card types the
// deck is currently short on. The numbers below are heuristic targets
// for a "balanced" 100-card Commander deck — they are NOT rules. Decks
// can be perfectly playable with very different distributions
// (mono-creature tribal, all-spells storm, etc.). The bias is only a
// soft preference applied when ranking the swipe queue.

import type { Card, Deck, DeckCategory } from "./types";
import { categoryBreakdown, categorize } from "./analytics";

// Target counts by type for a 100-card deck. Lands and Creatures form
// the backbone; the rest is shaped flexibly. Battle and Planeswalker
// are low because they're situational. Commander is fixed at 1 (or 2
// with partner) by the format and not biased.
export const TYPE_TARGETS: Record<DeckCategory, number> = {
  Commander: 1,
  Land: 36,
  Creature: 28,
  Instant: 8,
  Sorcery: 6,
  Artifact: 10,
  Enchantment: 6,
  Planeswalker: 3,
  Battle: 0,
};

export interface CompositionState {
  counts: Record<DeckCategory, number>;
  // Deficit per type: how many of this type the deck is missing relative
  // to its target. Negative values are treated as zero — we never
  // discourage a type, only encourage deficit ones.
  deficits: Record<DeckCategory, number>;
  // Tier: 0 (saturated) → 3 (severely under). Used for bucket-style
  // ordering so deficit cards bubble up without collapsing the existing
  // synergy/shuffle order.
  tiers: Record<DeckCategory, number>;
}

export function deckComposition(deck: Deck): CompositionState {
  const breakdown = categoryBreakdown(deck);
  const counts = {} as Record<DeckCategory, number>;
  const deficits = {} as Record<DeckCategory, number>;
  const tiers = {} as Record<DeckCategory, number>;
  for (const cat of Object.keys(TYPE_TARGETS) as DeckCategory[]) {
    const count = breakdown[cat].reduce((s, e) => s + e.quantity, 0);
    counts[cat] = count;
    const target = TYPE_TARGETS[cat];
    const deficit = Math.max(0, target - count);
    deficits[cat] = deficit;
    tiers[cat] = tierFor(count, target);
  }
  return { counts, deficits, tiers };
}

// Tier scale, larger = more under-represented:
//   3 — severely under (≤ 50% of target)
//   2 — under (50–80%)
//   1 — slightly under (80–100%)
//   0 — at or over target
function tierFor(count: number, target: number): number {
  if (target <= 0) return 0;
  const ratio = count / target;
  if (ratio < 0.5) return 3;
  if (ratio < 0.8) return 2;
  if (ratio < 1.0) return 1;
  return 0;
}

// Convenience: deficit tier for a single card given a precomputed
// CompositionState. Cards already in the deck can still be classified
// here — caller is expected to filter those out separately.
export function deficitTierForCard(card: Card, comp: CompositionState): number {
  return comp.tiers[categorize(card)] ?? 0;
}
