// Commander format validation. All rules sourced from the official Commander
// Rules Committee policy and Magic Comprehensive Rules section 903.
// https://mtgcommander.net/index.php/rules/
//
// We DO NOT invent rules. Every check below ties to a specific written rule.

import type { Card, Color, Deck, ValidationIssue } from "./types";
import { isLegalCommander } from "./scryfall";

// 903.5 — A Commander deck contains exactly 100 cards including the commander(s).
export const DECK_SIZE = 100;

// 903.5b — With the exception of basic lands and cards that explicitly say
// "A deck can have any number of cards named ___", no two cards in the deck
// may have the same English name.
//
// Detection is driven primarily by the card's oracle text (see
// `isUnlimitedQuantity`). The static set below is a tiny fallback for the
// well-known "any number" cards in case a card record arrives without
// oracle_text. Keep entries verified — fabricated names break the singleton
// check silently. See the Commander RC announcement archive for the full list.
const SINGLETON_EXEMPT_NAMES = new Set<string>([
  "Persistent Petitioners",
  "Rat Colony",
  "Relentless Rats",
  "Shadowborn Apostle",
  "Dragon's Approach",
  "Seven Dwarves",
  "Nazgûl",
  "Hare Apparent",
]);

const BASIC_LAND_NAMES = new Set<string>([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
  "Snow-Covered Wastes",
]);

export function isBasicLand(card: Card): boolean {
  if (BASIC_LAND_NAMES.has(card.name)) return true;
  return /(^|\s)Basic\s+/.test(card.type_line) && card.type_line.includes("Land");
}

export function isUnlimitedQuantity(card: Card): boolean {
  if (isBasicLand(card)) return true;
  if (SINGLETON_EXEMPT_NAMES.has(card.name)) return true;
  // Detect from oracle text directly so newly printed cards are picked up.
  const text = (card.oracle_text ?? "").toLowerCase();
  if (/a deck can have any number of cards named/.test(text)) return true;
  return false;
}

// 903.4 — Color identity is the union of all mana symbols on the card,
// including those in mana costs, in rules text, and in the cost of activated
// abilities, plus any color indicator. Reminder text is excluded.
export function colorIdentityOf(card: Card): Set<Color> {
  return new Set(card.color_identity);
}

export function commanderColorIdentity(commander: Card | undefined, partner: Card | undefined): Set<Color> {
  const out = new Set<Color>();
  for (const c of [commander, partner]) {
    if (!c) continue;
    for (const ci of c.color_identity) out.add(ci);
  }
  return out;
}

// 903.6 — Each card in a Commander deck (including the commander itself)
// must be within the color identity of the commander(s).
export function withinColorIdentity(card: Card, allowed: Set<Color>): boolean {
  for (const c of card.color_identity) if (!allowed.has(c)) return false;
  return true;
}

// 903.5a — The deck's commander must be a legendary creature, OR a card whose
// rules text states it may be your commander. Some Planeswalkers qualify.
export function canBeCommander(card: Card): boolean {
  return isLegalCommander(card);
}

// CR 702.124 — Partner is a keyword ability. Scryfall populates the
// `keywords` array on every card; we trust that as the primary source and
// only fall back to oracle text when the array is empty (older data).
export function hasPartner(card: Card): boolean {
  if (card.keywords?.includes("Partner")) return true;
  return /(^|\n)Partner(\s|\.|$)/m.test(card.oracle_text ?? "");
}

// CR 702.124b — "Partner with [name]" pairs only with the named card.
// Returns the partner's required name, or null if absent.
export function partnerWithTarget(card: Card): string | null {
  const text = card.oracle_text ?? "";
  const m = /Partner with ([^\n.(]+?)(?:\s*\(|$|\.|\n)/.exec(text);
  return m ? m[1].trim() : null;
}

// CR 702.124c — "Friends forever" — same pairing rules as Partner.
export function hasFriendsForever(card: Card): boolean {
  if (card.keywords?.some((k) => /friends forever/i.test(k))) return true;
  return /Friends forever/i.test(card.oracle_text ?? "");
}

// CR 702.139 — "Doctor's companion" pairs with a creature whose type line
// contains "Time Lord Doctor". Used in Doctor Who Universes Beyond.
export function hasDoctorsCompanion(card: Card): boolean {
  if (card.keywords?.some((k) => /doctor.{0,3}companion/i.test(k))) return true;
  return /Doctor['’]s companion/i.test(card.oracle_text ?? "");
}

export function isDoctor(card: Card): boolean {
  return /Time Lord/.test(card.type_line) && /Doctor/.test(card.type_line);
}

// 903.5c — Background: A commander with "Choose a Background" may be paired
// with one Background enchantment as a second commander.
export function hasChooseABackground(card: Card): boolean {
  return /choose a background/i.test(card.oracle_text ?? "");
}

export function isBackground(card: Card): boolean {
  return /enchantment\s+—\s+background/i.test(card.type_line);
}

// 903.6c — Banlist enforcement is delegated to Scryfall's `legalities` map,
// which is updated whenever the Commander RC publishes changes.
export function isBannedInCommander(card: Card): boolean {
  return card.legalities.commander === "banned";
}

// Validate a deck. Returns issues; an empty array means tournament-legal.
export function validateDeck(deck: Deck): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entries = Object.values(deck.entries);
  const commander = deck.commanderId ? entries.find((e) => e.cardId === deck.commanderId)?.card : undefined;
  const partner = deck.partnerId ? entries.find((e) => e.cardId === deck.partnerId)?.card : undefined;

  if (!commander) {
    issues.push({ level: "error", rule: "903.5a", message: "No commander selected." });
    return issues;
  }
  if (!canBeCommander(commander)) {
    issues.push({
      level: "error",
      rule: "903.5a",
      message: `${commander.name} cannot be a commander (must be a legendary creature or have "can be your commander").`,
      cardId: commander.id,
    });
  }
  if (partner) {
    const bothPartner = hasPartner(commander) && hasPartner(partner);
    const partnerWithMatch =
      partnerWithTarget(commander) === partner.name ||
      partnerWithTarget(partner) === commander.name;
    const friendsForever = hasFriendsForever(commander) && hasFriendsForever(partner);
    const doctorPair =
      (isDoctor(commander) && hasDoctorsCompanion(partner)) ||
      (isDoctor(partner) && hasDoctorsCompanion(commander));
    const backgroundCombo =
      (hasChooseABackground(commander) && isBackground(partner)) ||
      (hasChooseABackground(partner) && isBackground(commander));
    if (!bothPartner && !partnerWithMatch && !friendsForever && !doctorPair && !backgroundCombo) {
      issues.push({
        level: "error",
        rule: "903.5b",
        message: `${commander.name} and ${partner.name} are not a valid Partner, Partner-with, Friends-forever, Doctor's-companion, or Background pairing.`,
        cardId: partner.id,
      });
    }
  }

  // Total card count
  const total = entries.reduce((sum, e) => sum + e.quantity, 0);
  if (total !== DECK_SIZE) {
    issues.push({
      level: total < DECK_SIZE ? "warning" : "error",
      rule: "903.5",
      message: `Deck has ${total} cards (must be exactly ${DECK_SIZE}).`,
    });
  }

  // Color identity of the command zone
  const allowed = commanderColorIdentity(commander, partner);

  for (const e of entries) {
    if (isBannedInCommander(e.card)) {
      issues.push({
        level: "error",
        rule: "Banlist",
        message: `${e.card.name} is banned in Commander.`,
        cardId: e.card.id,
      });
    }
    if (e.card.legalities.commander === "not_legal") {
      issues.push({
        level: "error",
        rule: "903.6c",
        message: `${e.card.name} is not legal in Commander.`,
        cardId: e.card.id,
      });
    }
    if (!withinColorIdentity(e.card, allowed)) {
      const offending = e.card.color_identity.filter((c) => !allowed.has(c)).join("");
      issues.push({
        level: "error",
        rule: "903.6",
        message: `${e.card.name} is outside the commander's color identity ({${offending}}).`,
        cardId: e.card.id,
      });
    }
    if (e.quantity > 1 && !isUnlimitedQuantity(e.card)) {
      issues.push({
        level: "error",
        rule: "903.5b",
        message: `${e.card.name} appears ${e.quantity} times (singleton rule allows only 1).`,
        cardId: e.card.id,
      });
    }
  }

  return issues;
}

// 903.4 — Surface a single-glyph string for compact UI.
export function colorIdentityString(set: Set<Color> | Color[]): string {
  const order: Color[] = ["W", "U", "B", "R", "G"];
  const arr = Array.isArray(set) ? new Set(set) : set;
  return order.filter((c) => arr.has(c)).join("") || "C";
}
