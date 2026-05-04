// Land optimization for Commander decks.
// Calculates pip-proportional land distribution and fetches real lands
// from Scryfall based on the deck's color identity.

import type { Card, Color, Deck, DeckEntry } from "./types";
import { colorPips, deckEntries } from "./analytics";
import { commanderColorIdentity, colorIdentityString } from "./commander-rules";
import { scryfall } from "./scryfall";

const TARGET_LANDS = 36;
// Budget mode pulls in any "premium" land priced at or below this cap.
// Anything above is reserved for "I'm Rich".
const BUDGET_PRICE_CAP_USD = 5;

// Budget-tier: affordable dual lands, tri-lands, basics
const BUDGET_DUAL_QUERIES: Record<string, string> = {
  WU: 't:land o:"add" (o:"{W}" o:"{U}") -o:"pay" legal:commander',
  WB: 't:land o:"add" (o:"{W}" o:"{B}") -o:"pay" legal:commander',
  WR: 't:land o:"add" (o:"{W}" o:"{R}") -o:"pay" legal:commander',
  WG: 't:land o:"add" (o:"{W}" o:"{G}") -o:"pay" legal:commander',
  UB: 't:land o:"add" (o:"{U}" o:"{B}") -o:"pay" legal:commander',
  UR: 't:land o:"add" (o:"{U}" o:"{R}") -o:"pay" legal:commander',
  UG: 't:land o:"add" (o:"{U}" o:"{G}") -o:"pay" legal:commander',
  BR: 't:land o:"add" (o:"{B}" o:"{R}") -o:"pay" legal:commander',
  BG: 't:land o:"add" (o:"{B}" o:"{G}") -o:"pay" legal:commander',
  RG: 't:land o:"add" (o:"{R}" o:"{G}") -o:"pay" legal:commander',
};

// Cheap-and-cheerful multi-color utility lands. Always tried in budget mode
// (price-gated post-fetch). Names match Scryfall.
const UTILITY_LANDS: string[] = [
  "Exotic Orchard",         // taps for any color your opponents can produce
  "Reflecting Pool",        // mid-priced; budget mode price-gates it
  "Mana Confluence",        // mid/high; budget mode price-gates it
  "City of Brass",          // mid; budget mode price-gates it
  "Forbidden Orchard",
  "Path of Ancestry",       // tribal scry land, $1
  "Reliquary Tower",        // colorless utility, ~$1-2
  "Rogue's Passage",        // unblockable, ~$1
  "Myriad Landscape",       // 2-color basic ramp, ~$1
  "Ash Barrens",            // basic-fetch, ~$1
  "Terramorphic Expanse",   // basic-fetch, ~$0.50
  "Evolving Wilds",         // basic-fetch, ~$0.50
  "Prismatic Vista",        // basic-fetch, ~$15 — rich-only by price gate
  "Bojuka Bog",             // graveyard hate, ~$1 (B identity only — filtered)
  "Strip Mine",             // utility, mid-priced
  "Wasteland",              // utility, $$$
  "Maze of Ith",            // defensive, ~$10 — rich-only by price gate
  "Homeward Path",          // anti-theft, ~$1
  "Karn's Bastion",         // proliferate, ~$1
];

// High-priced premium lands — only get added in "I'm Rich" mode.
// Includes the no-question-expensive cycle (duals, fetches, shocks, power lands).
const PREMIUM_LAND_NAMES: string[] = [
  // Original dual lands
  "Tundra", "Underground Sea", "Badlands", "Taiga",
  "Savannah", "Scrubland", "Volcanic Island", "Bayou",
  "Plateau", "Tropical Island",
  // Fetch lands
  "Flooded Strand", "Polluted Delta", "Bloodstained Mire",
  "Wooded Foothills", "Windswept Heath", "Marsh Flats",
  "Scalding Tarn", "Verdant Catacombs", "Arid Mesa",
  "Misty Rainforest",
  // Shock lands
  "Hallowed Fountain", "Watery Grave", "Blood Crypt",
  "Stomping Ground", "Temple Garden", "Godless Shrine",
  "Steam Vents", "Overgrown Tomb", "Sacred Foundry",
  "Breeding Pool",
  // Power lands
  "Gaea's Cradle", "Serra's Sanctum", "Tolarian Academy",
  "Ancient Tomb", "The Tabernacle at Pendrell Vale",
  "Cabal Coffers", "Urborg, Tomb of Yawgmoth",
  "Nykthos, Shrine to Nyx",
  // Triomes
  "Raugrin Triome", "Ketria Triome", "Indatha Triome",
  "Savai Triome", "Zagoth Triome",
  "Spara's Headquarters", "Raffine's Tower", "Xander's Lounge",
  "Ziatora's Proving Ground", "Jetmir's Garden",
];

const BASIC_NAMES: Record<Color, string> = {
  W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest",
};

export interface LandPlan {
  landsToAdd: { card: Card; reason: string }[];
  landsToRemove: string[];
  totalLands: number;
}

function pipProportions(pips: Record<Color, number>, allowed: Set<Color>): Record<Color, number> {
  const total = Object.entries(pips)
    .filter(([c]) => allowed.has(c as Color))
    .reduce((s, [, v]) => s + v, 0);
  if (total === 0) {
    const n = allowed.size || 1;
    const out: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const c of allowed) out[c] = 1 / n;
    return out;
  }
  const out: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of allowed) out[c] = (pips[c] ?? 0) / total;
  return out;
}

function colorPairKey(a: Color, b: Color): string {
  return [a, b].sort().join("");
}

export async function optimizeLands(
  deck: Deck,
  mode: "budget" | "rich",
): Promise<LandPlan> {
  const entries = deckEntries(deck);
  const commander = deck.commanderId ? deck.entries[deck.commanderId]?.card : undefined;
  const partner = deck.partnerId ? deck.entries[deck.partnerId]?.card : undefined;
  const allowed = commanderColorIdentity(commander, partner);
  const pips = colorPips(deck);
  const proportions = pipProportions(pips, allowed);

  const existingLandIds = new Set<string>();
  const existingLandNames = new Set<string>();
  for (const e of entries) {
    if (/Land/.test(e.card.type_line)) {
      existingLandIds.add(e.card.id);
      existingLandNames.add(e.card.name);
    }
  }

  const nonLandCount = entries
    .filter((e) => !/Land/.test(e.card.type_line))
    .reduce((s, e) => s + e.quantity, 0);

  const landSlots = Math.max(0, 100 - nonLandCount);
  const targetLands = Math.min(landSlots, TARGET_LANDS);

  const landsToAdd: { card: Card; reason: string }[] = [];
  const seen = new Set<string>();

  if (allowed.size === 0) {
    // Colorless — just use Wastes
    return { landsToAdd: [], landsToRemove: [], totalLands: targetLands };
  }

  // Always include Command Tower for 2+ color decks
  if (allowed.size >= 2 && !existingLandNames.has("Command Tower")) {
    try {
      const ct = await scryfall.cardByName("Command Tower");
      if (ct) {
        landsToAdd.push({ card: ct, reason: "Auto-include: fixes all your colors" });
        seen.add(ct.name);
      }
    } catch {}
  }

  // Both modes: pull cheap utility lands (Exotic Orchard, Path of Ancestry,
  // basic-fetches, etc.). Price-gated in budget mode so the genuinely
  // expensive ones (Prismatic Vista, Wasteland) only appear in "I'm Rich".
  // "I'm Rich" mode also pulls every premium land regardless of price.
  const namesToFetch = new Set<string>(UTILITY_LANDS);
  if (mode === "rich") for (const n of PREMIUM_LAND_NAMES) namesToFetch.add(n);
  const fetchList = Array.from(namesToFetch).filter(
    (n) => !existingLandNames.has(n) && !seen.has(n),
  );
  if (fetchList.length > 0) {
    try {
      const fetched = await scryfall.collection(fetchList.map((name) => ({ name })));
      for (const card of fetched) {
        if (seen.has(card.name)) continue;
        if (card.legalities.commander !== "legal") continue;
        if (card.color_identity.some((c) => !allowed.has(c))) continue;
        const price = parseFloat(card.prices.usd ?? "0");
        // Budget mode: only include lands at or below the cap
        if (mode === "budget" && price > BUDGET_PRICE_CAP_USD) continue;
        seen.add(card.name);
        const priceLabel = card.prices.usd ? ` ($${card.prices.usd})` : "";
        landsToAdd.push({
          card,
          reason: price > BUDGET_PRICE_CAP_USD ? `Premium land${priceLabel}` : `Utility land${priceLabel}`,
        });
      }
    } catch {}
  }

  // Fetch dual lands for each color pair in identity
  const colorArr = Array.from(allowed);
  if (colorArr.length >= 2) {
    for (let i = 0; i < colorArr.length; i++) {
      for (let j = i + 1; j < colorArr.length; j++) {
        const pair = colorPairKey(colorArr[i], colorArr[j]);
        const q = BUDGET_DUAL_QUERIES[pair];
        if (!q) continue;
        const idQ = `id<=${colorIdentityString(allowed).toLowerCase()}`;
        try {
          const list = await scryfall.searchCards(`${q} ${idQ}`, { order: "edhrec" });
          for (const card of list.data.slice(0, mode === "rich" ? 4 : 2)) {
            if (seen.has(card.name) || existingLandNames.has(card.name)) continue;
            seen.add(card.name);
            landsToAdd.push({ card, reason: `Dual land (${pair})` });
          }
        } catch {}
      }
    }
  }

  // Triomes for 3+ color decks
  if (colorArr.length >= 3 && mode === "budget") {
    try {
      const idQ = `id<=${colorIdentityString(allowed).toLowerCase()}`;
      const list = await scryfall.searchCards(
        `t:land o:"cycling" (t:"Plains" or t:"Island" or t:"Swamp" or t:"Mountain" or t:"Forest") ${idQ} legal:commander`,
        { order: "edhrec" },
      );
      for (const card of list.data.slice(0, 3)) {
        if (seen.has(card.name) || existingLandNames.has(card.name)) continue;
        seen.add(card.name);
        landsToAdd.push({ card, reason: "Triome/tri-land" });
      }
    } catch {}
  }

  // Fill remaining slots with basics proportional to pip count
  const slotsUsed = landsToAdd.length + existingLandIds.size;
  const basicsNeeded = Math.max(0, targetLands - slotsUsed);
  if (basicsNeeded > 0) {
    const basicAlloc: { color: Color; count: number }[] = [];
    let remaining = basicsNeeded;
    const sortedColors = colorArr.sort((a, b) => (proportions[b] ?? 0) - (proportions[a] ?? 0));
    for (let i = 0; i < sortedColors.length; i++) {
      const c = sortedColors[i];
      const count = i === sortedColors.length - 1
        ? remaining
        : Math.round(proportions[c] * basicsNeeded);
      basicAlloc.push({ color: c, count: Math.min(count, remaining) });
      remaining -= Math.min(count, remaining);
    }
    for (const { color, count } of basicAlloc) {
      if (count <= 0) continue;
      try {
        const basic = await scryfall.cardByName(BASIC_NAMES[color]);
        landsToAdd.push({
          card: basic,
          reason: `Basic (${count}x for ${color} pips)`,
          // Store the count in the reason; the component will parse it
        });
      } catch {}
    }
  }

  // Determine which existing lands to remove (all of them — we're replacing the manabase)
  const landsToRemove = Array.from(existingLandIds);

  return {
    landsToAdd,
    landsToRemove,
    totalLands: targetLands,
  };
}

// Auto-staples that go into every new commander deck.
// Sol Ring is legal in Commander and is by convention always-included; Arcane
// Signet is a colorless artifact that taps for any color in the commander's
// identity, so it's universally useful too.
const NEW_DECK_STAPLES: string[] = ["Sol Ring", "Arcane Signet"];

export async function seedNewDeckStaples(
  deck: Deck,
  add: (card: Card) => void,
): Promise<string[]> {
  const existingNames = new Set(
    Object.values(deck.entries).map((e) => e.card.name),
  );
  const toFetch = NEW_DECK_STAPLES.filter((n) => !existingNames.has(n));
  if (toFetch.length === 0) return [];
  const added: string[] = [];
  try {
    const fetched = await scryfall.collection(
      toFetch.map((name) => ({ name })),
    );
    for (const card of fetched) {
      if (card.legalities.commander !== "legal") continue;
      add(card);
      added.push(card.name);
    }
  } catch {
    // Scryfall failure shouldn't block deck creation
  }
  return added;
}

export function suggestCut(deck: Deck): DeckEntry | null {
  const entries = deckEntries(deck);
  const nonCommander = entries.filter(
    (e) => e.cardId !== deck.commanderId && e.cardId !== deck.partnerId,
  );
  if (nonCommander.length === 0) return null;

  // Score each card — higher score = better cut candidate
  // Factors: highest CMC, lowest EDHREC rank (less popular), highest price
  const scored = nonCommander.map((e) => {
    let score = 0;
    // Prefer cutting high-CMC cards
    score += e.card.cmc * 2;
    // Prefer cutting cards with bad EDHREC rank (higher = less popular)
    if (e.card.edhrec_rank) score += Math.min(e.card.edhrec_rank / 1000, 10);
    // Prefer cutting lands slightly less (they're important)
    if (/Land/.test(e.card.type_line)) score -= 5;
    // Prefer cutting duplicates
    if (e.quantity > 1) score += 3;
    return { entry: e, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.entry ?? null;
}
