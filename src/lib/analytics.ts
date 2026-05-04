// Pure functions over a deck — no rules invented, only descriptive stats.

import type { Card, Color, Deck, DeckEntry, DeckCategory } from "./types";
import { isBasicLand } from "./commander-rules";

const TYPE_ORDER: DeckCategory[] = [
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

export function categorize(card: Card): DeckCategory {
  const t = card.type_line;
  if (/Land/.test(t)) return "Land";
  if (/Creature/.test(t)) return "Creature";
  if (/Planeswalker/.test(t)) return "Planeswalker";
  if (/Battle/.test(t)) return "Battle";
  if (/Instant/.test(t)) return "Instant";
  if (/Sorcery/.test(t)) return "Sorcery";
  if (/Artifact/.test(t)) return "Artifact";
  if (/Enchantment/.test(t)) return "Enchantment";
  return "Creature";
}

export function deckEntries(deck: Deck): DeckEntry[] {
  return Object.values(deck.entries);
}

export function categoryBreakdown(deck: Deck): Record<DeckCategory, DeckEntry[]> {
  const out = Object.fromEntries(TYPE_ORDER.map((c) => [c, [] as DeckEntry[]])) as Record<DeckCategory, DeckEntry[]>;
  for (const e of deckEntries(deck)) {
    const cat = e.cardId === deck.commanderId || e.cardId === deck.partnerId ? "Commander" : (e.category ?? categorize(e.card));
    out[cat].push(e);
  }
  for (const cat of TYPE_ORDER) out[cat].sort((a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name));
  return out;
}

// Curve excludes lands (lands have CMC 0 and would skew the chart).
export function manaCurve(deck: Deck): { cmc: number; count: number }[] {
  const buckets = new Map<number, number>();
  for (const e of deckEntries(deck)) {
    if (e.cardId === deck.commanderId || e.cardId === deck.partnerId) continue;
    if (isBasicLand(e.card) || /Land/.test(e.card.type_line)) continue;
    const bucket = e.card.cmc >= 7 ? 7 : Math.floor(e.card.cmc);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + e.quantity);
  }
  const result: { cmc: number; count: number }[] = [];
  for (let i = 0; i <= 7; i++) result.push({ cmc: i, count: buckets.get(i) ?? 0 });
  return result;
}

// Color pip count from mana costs (not color identity).
export function colorPips(deck: Deck): Record<Color, number> {
  const out: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const e of deckEntries(deck)) {
    const cost = e.card.mana_cost ?? "";
    const matches = cost.match(/\{([WUBRG])\}/g) ?? [];
    for (const m of matches) {
      const c = m.replace(/[{}]/g, "") as Color;
      out[c] += e.quantity;
    }
  }
  return out;
}

export function landCount(deck: Deck): number {
  return deckEntries(deck)
    .filter((e) => /Land/.test(e.card.type_line))
    .reduce((s, e) => s + e.quantity, 0);
}

export function totalCards(deck: Deck): number {
  return deckEntries(deck).reduce((s, e) => s + e.quantity, 0);
}

export function deckPriceUsd(deck: Deck): number {
  let total = 0;
  for (const e of deckEntries(deck)) {
    const usd = parseFloat(e.card.prices.usd ?? "0");
    if (!Number.isNaN(usd)) total += usd * e.quantity;
  }
  return total;
}

export function averageCmc(deck: Deck): number {
  let total = 0;
  let count = 0;
  for (const e of deckEntries(deck)) {
    if (/Land/.test(e.card.type_line)) continue;
    if (e.cardId === deck.commanderId || e.cardId === deck.partnerId) continue;
    total += e.card.cmc * e.quantity;
    count += e.quantity;
  }
  return count > 0 ? total / count : 0;
}
