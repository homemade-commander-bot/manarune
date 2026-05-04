import type { Deck } from "./types";
import { categoryBreakdown, deckEntries } from "./analytics";

// MTGO / Arena style plain-text deck list. Compatible with Moxfield and Archidekt importers.
export function toDeckText(deck: Deck): string {
  const lines: string[] = [];
  if (deck.commanderId) {
    const cmd = deck.entries[deck.commanderId];
    if (cmd) lines.push(`1 ${cmd.card.name} *CMDR*`);
  }
  if (deck.partnerId) {
    const p = deck.entries[deck.partnerId];
    if (p) lines.push(`1 ${p.card.name} *CMDR*`);
  }
  lines.push("");
  for (const e of deckEntries(deck)) {
    if (e.cardId === deck.commanderId || e.cardId === deck.partnerId) continue;
    lines.push(`${e.quantity} ${e.card.name}`);
  }
  return lines.join("\n");
}

// Markdown summary for sharing
export function toMarkdown(deck: Deck): string {
  const cats = categoryBreakdown(deck);
  const out: string[] = [];
  out.push(`# ${deck.name}`);
  out.push("");
  for (const cat of Object.keys(cats) as (keyof typeof cats)[]) {
    if (cats[cat].length === 0) continue;
    out.push(`## ${cat} (${cats[cat].reduce((s, e) => s + e.quantity, 0)})`);
    for (const e of cats[cat]) out.push(`- ${e.quantity} [${e.card.name}](${e.card.scryfall_uri})`);
    out.push("");
  }
  return out.join("\n");
}
