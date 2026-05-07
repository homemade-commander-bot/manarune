// Commander Brackets estimator.
//
// Source: Wizards of the Coast's official Commander Brackets system
// (announced 2025). The five brackets are:
//   1 — Exhibition: ultra-casual / themed / pet decks
//   2 — Core:       precon-level
//   3 — Upgraded:   upgraded precons, some Game Changers (up to 3)
//   4 — Optimized:  high power, all Game Changers allowed, MLD/combos OK
//   5 — cEDH:       tournament-tuned
//
// References (verify before changing the Game Changers list):
//   https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta
//   https://mtgcommander.net/index.php/brackets/
//
// THIS IS A HEURISTIC. We never claim authoritative bracket placement —
// the estimator surfaces evidence (Game Changers / MLD / fast mana / tutors
// / suspected 2-card combos) and lets the user judge.

import type { Card, Deck } from "./types";
import { deckEntries, totalCards } from "./analytics";

// ---- Game Changers list ----
// Curated from the Commander Format Panel's published list. Names match
// Scryfall's English `card.name` exactly so we can compare cheaply.
// If a card is missing or you suspect it shouldn't be here, edit this
// constant — the estimator reads it dynamically.
export const GAME_CHANGERS: ReadonlySet<string> = new Set([
  // Tutors
  "Demonic Tutor",
  "Vampiric Tutor",
  "Imperial Seal",
  "Grim Tutor",
  "Mystical Tutor",
  "Enlightened Tutor",
  "Worldly Tutor",
  "Survival of the Fittest",
  "Natural Order",
  // Card advantage engines
  "Necropotence",
  "Rhystic Study",
  "Smothering Tithe",
  "Mystic Remora",
  "Sylvan Library",
  "Esper Sentinel",
  // Mass effects
  "Cyclonic Rift",
  "Farewell",
  "Armageddon",
  // Fast mana
  "Mana Crypt",
  "Mana Vault",
  "Jeweled Lotus",
  "Mox Diamond",
  "Chrome Mox",
  "Mox Opal",
  "Lotus Petal",
  "Grim Monolith",
  // Lands
  "Ancient Tomb",
  "Gaea's Cradle",
  "Tolarian Academy",
  "The Tabernacle at Pendrell Vale",
  // Stax / lock pieces
  "Drannith Magistrate",
  "Opposition Agent",
  "Trinisphere",
  "Winter Orb",
  "Stasis",
  "Static Orb",
  // Win conditions
  "Thassa's Oracle",
  "Demonic Consultation",
  "Tainted Pact",
  "Ad Nauseam",
  "Aetherflux Reservoir",
  // Counterspells / interaction
  "Force of Will",
  "Force of Negation",
  "Fierce Guardianship",
  "Mana Drain",
  "Pact of Negation",
  // Infinite-engine enablers
  "Yawgmoth, Thran Physician",
  "Kinnan, Bonder Prodigy",
  // Reanimator / cheat-into-play
  "Hullbreacher",
  "Glacial Chasm",
]);

// ---- Mass land destruction (MLD) detector ----
// CR doesn't define MLD; we match oracle text patterns the community treats as MLD.
const MLD_PATTERNS: RegExp[] = [
  /destroy all lands/i,
  /each player sacrifices? .* lands?/i,
  /destroy all nonbasic lands/i,
  /all lands? .* are destroyed/i,
];

export function isMassLandDestruction(card: Card): boolean {
  const text = card.oracle_text ?? "";
  return MLD_PATTERNS.some((re) => re.test(text));
}

// ---- Tutor detector (CR doesn't define "tutor"; community heuristic.) ----
// We count cards whose oracle text says "Search your library for a card".
// Any kind of land search (basic, Forest, dual, etc.) is NOT a tutor — those
// are ramp. Examples that must NOT count: Three Visits, Cultivate, Farseek,
// Kodama's Reach, Nature's Lore.
export function isTutor(card: Card): boolean {
  const text = card.oracle_text ?? "";
  // Any "search your library for ... land" sentence: ramp, not tutor.
  if (/Search your library for [^.]*\bland\b/i.test(text)) return false;
  return /Search your library for (a|an|up to)/i.test(text);
}

// ---- Fast mana detector ----
// We tag any nonland that produces ≥2 mana for ≤1 generic mana, plus the
// "all positive mana on turn 1" classics. List is intentionally short and
// explicit so we don't accidentally flag normal ramp.
export const FAST_MANA: ReadonlySet<string> = new Set([
  "Mana Crypt",
  "Mana Vault",
  "Sol Ring",
  "Mox Diamond",
  "Chrome Mox",
  "Mox Opal",
  "Lotus Petal",
  "Jeweled Lotus",
  "Grim Monolith",
  "Lion's Eye Diamond",
  "Mox Amber",
]);

// ---- Two-card infinite combo detector ----
// A small allow-list of the most common two-card commander combos, by
// exact card name. We DO NOT claim this is exhaustive — surfaced as
// "suspected combo pieces" in the UI.
export const KNOWN_COMBO_PIECES: { name: string; partners: string[] }[] = [
  { name: "Thassa's Oracle", partners: ["Demonic Consultation", "Tainted Pact"] },
  { name: "Demonic Consultation", partners: ["Thassa's Oracle", "Laboratory Maniac", "Jace, Wielder of Mysteries"] },
  { name: "Tainted Pact", partners: ["Thassa's Oracle", "Laboratory Maniac"] },
  { name: "Laboratory Maniac", partners: ["Demonic Consultation", "Tainted Pact"] },
  { name: "Jace, Wielder of Mysteries", partners: ["Demonic Consultation", "Tainted Pact"] },
  { name: "Dramatic Reversal", partners: ["Isochron Scepter"] },
  { name: "Isochron Scepter", partners: ["Dramatic Reversal"] },
  { name: "Heliod, Sun-Crowned", partners: ["Walking Ballista"] },
  { name: "Walking Ballista", partners: ["Heliod, Sun-Crowned"] },
  { name: "Mikaeus, the Unhallowed", partners: ["Triskelion"] },
  { name: "Triskelion", partners: ["Mikaeus, the Unhallowed"] },
  { name: "Kiki-Jiki, Mirror Breaker", partners: ["Felidar Guardian", "Zealous Conscripts"] },
  { name: "Felidar Guardian", partners: ["Kiki-Jiki, Mirror Breaker"] },
  { name: "Zealous Conscripts", partners: ["Kiki-Jiki, Mirror Breaker"] },
  { name: "Worldgorger Dragon", partners: ["Animate Dead", "Necromancy", "Dance of the Dead"] },
  { name: "Animate Dead", partners: ["Worldgorger Dragon"] },
  { name: "Necromancy", partners: ["Worldgorger Dragon"] },
  { name: "Dance of the Dead", partners: ["Worldgorger Dragon"] },
  { name: "Deadeye Navigator", partners: ["Peregrine Drake", "Palinchron", "Great Whale"] },
  { name: "Peregrine Drake", partners: ["Deadeye Navigator"] },
  { name: "Palinchron", partners: ["Deadeye Navigator"] },
  { name: "Food Chain", partners: ["Eternal Scourge", "Misthollow Griffin", "Squee, the Immortal"] },
  { name: "Eternal Scourge", partners: ["Food Chain"] },
  // Exquisite Blood lifegain ↔ damage loops. Several "lose-a-life-on-
  // gain-life" effects all combo with Exquisite Blood for an instant
  // win once one opponent takes any damage.
  { name: "Exquisite Blood", partners: [
    "Sanguine Bond",
    "Vito, Thorn of the Dusk Rose",
    "Cliffhaven Vampire",
    "Marauding Blight-Priest",
    "Defiant Bloodlord",
  ] },
  { name: "Sanguine Bond", partners: ["Exquisite Blood"] },
  { name: "Vito, Thorn of the Dusk Rose", partners: ["Exquisite Blood"] },
  { name: "Cliffhaven Vampire", partners: ["Exquisite Blood"] },
  { name: "Marauding Blight-Priest", partners: ["Exquisite Blood"] },
  { name: "Defiant Bloodlord", partners: ["Exquisite Blood"] },
];

// Returns a map of cardName → list of partner names already present in the
// deck. Reused by the DeckList to highlight live combo pieces.
export function findComboPiecesInDeck(deck: Deck): Map<string, string[]> {
  const namesInDeck = new Set(
    Object.values(deck.entries).map((e) => e.card.name),
  );
  const out = new Map<string, string[]>();
  for (const piece of KNOWN_COMBO_PIECES) {
    if (!namesInDeck.has(piece.name)) continue;
    const matched = piece.partners.filter((p) => namesInDeck.has(p));
    if (matched.length > 0) out.set(piece.name, matched);
  }
  return out;
}

// For a candidate card (typically not yet in the deck), return the names of
// any deck cards it would form a known two-card combo with. Used by SwipeFeed
// to flag incoming cards that complete a combo.
export function comboPartnersInDeck(card: Card, deck: Deck): string[] {
  const piece = KNOWN_COMBO_PIECES.find((p) => p.name === card.name);
  if (!piece) return [];
  const namesInDeck = new Set(
    Object.values(deck.entries).map((e) => e.card.name),
  );
  return piece.partners.filter((p) => namesInDeck.has(p));
}

// ---- The estimator ----
export interface BracketSignal {
  level: "info" | "warn" | "danger";
  message: string;
  cards?: string[];
}

export interface BracketEstimate {
  bracket: 1 | 2 | 3 | 4 | 5;
  label: "Exhibition" | "Core" | "Upgraded" | "Optimized" | "cEDH";
  description: string;
  confidence: "low" | "medium" | "high";
  gameChangers: string[];
  tutors: string[];
  fastMana: string[];
  mld: string[];
  comboPieces: { name: string; matchedPartners: string[] }[];
  signals: BracketSignal[];
}

type BracketLevel = 1 | 2 | 3 | 4 | 5;
const BRACKET_LABELS: Record<BracketLevel, BracketEstimate["label"]> = {
  1: "Exhibition",
  2: "Core",
  3: "Upgraded",
  4: "Optimized",
  5: "cEDH",
};
const BRACKET_DESCRIPTIONS: Record<BracketLevel, string> = {
  1: "Ultra-casual, themed or pet decks. No Game Changers, no MLD, no early infinite combos, no chained tutors.",
  2: "Precon-level power. No Game Changers, no MLD, no fast wins. Roughly out-of-the-box Commander precons.",
  3: "Upgraded precons. Up to 3 Game Changers, no MLD, no early infinite combos. Game ends ~turns 9+.",
  4: "Optimized / high-power. Game Changers, MLD, infinite combos, fast mana all permitted. Game ends ~turns 6–8.",
  5: "Tournament-tuned cEDH. Maximally optimized lists with strong stack interaction and proactive wins.",
};

export function estimateBracket(deck: Deck): BracketEstimate {
  const entries = deckEntries(deck);
  const cards = entries.map((e) => e.card);

  const gameChangers = cards.filter((c) => GAME_CHANGERS.has(c.name)).map((c) => c.name);
  const tutors = cards.filter((c) => isTutor(c)).map((c) => c.name);
  const fastMana = cards.filter((c) => FAST_MANA.has(c.name)).map((c) => c.name);
  const mld = cards.filter((c) => isMassLandDestruction(c)).map((c) => c.name);

  // 2-card combo piece detection
  const namesInDeck = new Set(cards.map((c) => c.name));
  const comboPieces: { name: string; matchedPartners: string[] }[] = [];
  for (const piece of KNOWN_COMBO_PIECES) {
    if (!namesInDeck.has(piece.name)) continue;
    const matchedPartners = piece.partners.filter((p) => namesInDeck.has(p));
    if (matchedPartners.length > 0) comboPieces.push({ name: piece.name, matchedPartners });
  }
  // Dedupe symmetric pairs (A,B) and (B,A)
  const seenPair = new Set<string>();
  const uniqueComboPieces = comboPieces.filter((c) => {
    const key = [c.name, ...c.matchedPartners].sort().join("|");
    if (seenPair.has(key)) return false;
    seenPair.add(key);
    return true;
  });

  // ---- Bracket assignment per RC published criteria ----
  // The brackets system explicitly calls out four "differentiators":
  //   • Game Changers count
  //   • Mass Land Destruction
  //   • Extra Turns spells (chains)
  //   • Two-card infinite combos (especially fast ones)
  // and adds tutors/fast-mana density as soft signals.
  //
  // We compute the highest bracket the deck CAN'T be (because it has too much
  // of a category) and then place it at the next-highest tier.

  let bracket: 1 | 2 | 3 | 4 | 5 = 1;
  const signals: BracketSignal[] = [];

  if (gameChangers.length === 0 && mld.length === 0 && uniqueComboPieces.length === 0 && fastMana.length === 0 && tutors.length <= 1) {
    bracket = 1;
  } else if (gameChangers.length === 0 && mld.length === 0 && uniqueComboPieces.length === 0 && fastMana.length <= 1) {
    bracket = 2;
  } else if (gameChangers.length <= 3 && mld.length === 0 && uniqueComboPieces.length === 0) {
    bracket = 3;
  } else if (uniqueComboPieces.length <= 1 && fastMana.length <= 4 && gameChangers.length <= 8) {
    bracket = 4;
  } else {
    bracket = 5;
  }

  // ---- Signals (always reported, drive UI explanation) ----
  if (gameChangers.length > 0) {
    signals.push({
      level: gameChangers.length > 3 ? "warn" : "info",
      message: `${gameChangers.length} Game Changer${gameChangers.length === 1 ? "" : "s"} (allowed in Brackets 3+, up to 3 in Bracket 3).`,
      cards: gameChangers,
    });
  }
  if (fastMana.length > 0) {
    signals.push({
      level: fastMana.length > 2 ? "warn" : "info",
      message: `${fastMana.length} fast-mana piece${fastMana.length === 1 ? "" : "s"}.`,
      cards: fastMana,
    });
  }
  if (tutors.length > 0) {
    signals.push({
      level: tutors.length > 4 ? "warn" : "info",
      message: `${tutors.length} tutor${tutors.length === 1 ? "" : "s"} detected.`,
      cards: tutors,
    });
  }
  if (mld.length > 0) {
    signals.push({
      level: "danger",
      message: `${mld.length} mass land destruction effect${mld.length === 1 ? "" : "s"} — disallowed in Brackets 1–3.`,
      cards: mld,
    });
  }
  if (uniqueComboPieces.length > 0) {
    signals.push({
      level: "danger",
      message: `${uniqueComboPieces.length} suspected two-card infinite combo${uniqueComboPieces.length === 1 ? "" : "s"} — disallowed in Brackets 1–3.`,
      cards: uniqueComboPieces.flatMap((c) => [c.name, ...c.matchedPartners]),
    });
  }

  // ---- Confidence ----
  // Combo detection is intrinsically incomplete (we only see ~13 well-known
  // pairs). If the deck is small, recently changed, or shows weird signals,
  // back off confidence.
  const total = totalCards(deck);
  let confidence: "low" | "medium" | "high" = "high";
  if (total < 60) confidence = "low";
  else if (total < 95) confidence = "medium";

  return {
    bracket,
    label: BRACKET_LABELS[bracket],
    description: BRACKET_DESCRIPTIONS[bracket],
    confidence,
    gameChangers,
    tutors,
    fastMana,
    mld,
    comboPieces: uniqueComboPieces,
    signals,
  };
}
