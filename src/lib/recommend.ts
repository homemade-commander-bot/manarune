// Recommendation logic. Combines EDHREC's commander page (when available)
// with Scryfall searches built from the commander's themes & color identity.
//
// Heuristics here are explicitly *suggestions*. They never invent rules — they
// build legal Scryfall queries that respect the commander's color identity.

import type { Card, Color } from "./types";
import { scryfall, isLegalCommander } from "./scryfall";
import { edhrec } from "./edhrec";
import { commanderColorIdentity, colorIdentityString } from "./commander-rules";

export interface Recommendation {
  card: Card;
  reason: string;
  source: "edhrec" | "scryfall" | "staple" | "theme";
  section: string;
  synergy?: number;
  inclusion?: number;
  rank: number;
}

// Detect rough deck themes from a commander's oracle text.
export function detectThemes(commander: Card): string[] {
  const text = ((commander.oracle_text ?? "") + " " + (commander.type_line ?? "")).toLowerCase();
  const themes = new Set<string>();
  const matchers: { theme: string; pattern: RegExp }[] = [
    { theme: "tokens", pattern: /create.*token/ },
    { theme: "+1/+1 counters", pattern: /\+1\/\+1 counter/ },
    { theme: "lifegain", pattern: /gain \d+ life|whenever you gain life/ },
    { theme: "graveyard", pattern: /from (a|your) graveyard|return.*graveyard.*battlefield/ },
    { theme: "reanimator", pattern: /return.*creature card.*from.*graveyard.*battlefield/ },
    { theme: "spellslinger", pattern: /whenever you cast.*(instant|sorcery)|cast.*from your graveyard/ },
    { theme: "artifacts", pattern: /artifact you control|whenever.*artifact.*enters/ },
    { theme: "enchantments", pattern: /enchantment you control|whenever.*enchantment.*enters/ },
    { theme: "equipment", pattern: /equipment|attach/ },
    { theme: "voltron", pattern: /equipped creature gets|enchanted creature gets/ },
    { theme: "aristocrats", pattern: /whenever .* dies|sacrifice a creature/ },
    { theme: "blink", pattern: /exile.*then return.*battlefield/ },
    { theme: "mill", pattern: /mill|put .* cards .* into .* graveyard/ },
    { theme: "draw", pattern: /draw .* cards|whenever you draw/ },
    { theme: "ramp", pattern: /search your library for.*land/ },
    { theme: "burn", pattern: /deals \d+ damage to any target|deals damage to .* opponent/ },
    { theme: "control", pattern: /counter target spell|destroy target/ },
    { theme: "tribal", pattern: /creatures you control.*get|other .* you control/ },
    { theme: "lifelink", pattern: /lifelink/ },
    { theme: "deathtouch", pattern: /deathtouch/ },
    { theme: "flying", pattern: /flying/ },
    { theme: "discard", pattern: /opponent discards|discard a card/ },
    { theme: "treasure", pattern: /treasure token/ },
    { theme: "energy", pattern: /energy counter|\{e\}/ },
    { theme: "infect", pattern: /infect|toxic|proliferate/ },
    { theme: "extra turns", pattern: /take an extra turn/ },
  ];
  for (const m of matchers) if (m.pattern.test(text)) themes.add(m.theme);

  // Tribal subtypes from the commander's own type line
  const tribalSubtype = commander.type_line.match(/—\s+([A-Z][A-Za-z]+)/);
  if (tribalSubtype) themes.add(`tribal:${tribalSubtype[1].toLowerCase()}`);
  return Array.from(themes);
}

function colorIdentityQuery(allowed: Set<Color>): string {
  return `id<=${colorIdentityString(allowed).toLowerCase() || "c"}`;
}

// Curated, format-staple seed queries by role. Always filtered through
// Scryfall with the commander's color identity, so nothing illegal slips in.
export const STAPLES: { role: string; query: string; reason: string }[] = [
  { role: "Mana Rocks", query: "(o:'add {C}' or o:'add one mana' or o:'add two mana') t:artifact cmc<=3", reason: "Fast colorless mana" },
  { role: "Ramp", query: "o:'search your library for' o:'land card' (t:sorcery or t:instant) cmc<=3", reason: "Land ramp" },
  { role: "Ramp", query: "(t:creature o:'search your library for a' o:'land card') cmc<=3", reason: "Ramp creature" },
  { role: "Card Draw", query: "(o:'draw three cards' or o:'draw two cards' or o:'draw a card for each')", reason: "Card advantage" },
  { role: "Card Draw", query: "o:'whenever you' o:'draw a card' t:enchantment", reason: "Repeatable draw" },
  { role: "Removal", query: "(o:'destroy target creature' or o:'exile target creature') (t:instant or t:sorcery) cmc<=3", reason: "Single-target removal" },
  { role: "Removal", query: "(o:'destroy target permanent' or o:'exile target permanent') (t:instant or t:sorcery)", reason: "Flex removal" },
  { role: "Board Wipe", query: "(o:'destroy all creatures' or o:'each creature gets -' or o:'exile all creatures')", reason: "Mass removal" },
  { role: "Board Wipe", query: "(o:'destroy all nonland permanents' or o:'exile all permanents')", reason: "Mass reset" },
  { role: "Lands", query: "t:land o:'add one mana of any color'", reason: "Color-fixing land" },
  { role: "Lands", query: "t:land o:'enters the battlefield tapped' o:'add'", reason: "Dual land" },
  { role: "Protection", query: "o:'hexproof' (t:instant or t:enchantment) cmc<=3", reason: "Commander protection" },
  { role: "Counterspells", query: "o:'counter target spell' t:instant cmc<=3", reason: "Stack interaction" },
  { role: "Tutors", query: "o:'search your library for' o:card -o:land cmc<=4", reason: "Card selection" },
];

export async function staplesFor(allowed: Set<Color>, max = 60): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  const idQ = colorIdentityQuery(allowed);
  const seen = new Set<string>();
  let rank = 1;
  for (const s of STAPLES) {
    try {
      const list = await scryfall.searchCards(`${s.query} ${idQ} legal:commander`, { order: "edhrec" });
      for (const c of list.data.slice(0, 6)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push({ card: c, reason: `${s.role}: ${s.reason}`, source: "staple", section: s.role, rank: rank++ });
      }
      if (out.length >= max) break;
    } catch {
      // ignore individual failures
    }
  }
  return out.slice(0, max);
}

// Theme-specific Scryfall queries when we detect a theme.
const THEME_QUERIES: Record<string, { role: string; query: string; reason: string }[]> = {
  tokens: [
    { role: "Token Producers", query: "o:'create' o:'token' (t:creature or t:enchantment)", reason: "Creates tokens" },
    { role: "Token Anthem", query: "(o:'creatures you control get +' or o:'tokens you control get +')", reason: "Buffs your tokens" },
  ],
  "+1/+1 counters": [
    { role: "Counter Synergy", query: "o:'+1/+1 counter' (t:enchantment or t:artifact)", reason: "Counter support" },
    { role: "Proliferate", query: "o:proliferate", reason: "Multiplies counters" },
  ],
  lifegain: [
    { role: "Lifegain Payoffs", query: "o:'whenever you gain life'", reason: "Triggers off lifegain" },
    { role: "Repeatable Gain", query: "o:'lifelink'", reason: "Continuous lifegain" },
  ],
  graveyard: [
    { role: "Recursion", query: "o:'return target' o:'from your graveyard to your hand'", reason: "Card recursion" },
    { role: "GY Synergy", query: "o:'cards in your graveyard'", reason: "Graveyard payoff" },
  ],
  reanimator: [
    { role: "Reanimation", query: "o:'return target creature card from' o:graveyard o:battlefield", reason: "Reanimate creatures" },
  ],
  spellslinger: [
    { role: "Spell Triggers", query: "o:'whenever you cast' (o:instant or o:sorcery)", reason: "Cast triggers" },
    { role: "Cost Reduction", query: "o:'instant and sorcery spells you cast cost'", reason: "Cheaper spells" },
  ],
  artifacts: [
    { role: "Artifact Synergy", query: "(o:'artifact you control' or o:'whenever an artifact enters')", reason: "Artifact payoff" },
  ],
  enchantments: [
    { role: "Enchantment Synergy", query: "(o:'enchantment you control' or o:'whenever an enchantment enters')", reason: "Enchantment payoff" },
  ],
  equipment: [
    { role: "Equipment", query: "t:equipment", reason: "Gear up" },
    { role: "Equipment Support", query: "o:'equipped creature' or o:'equip costs you pay'", reason: "Equipment payoff" },
  ],
  voltron: [
    { role: "Auras", query: "t:aura o:'enchant creature'", reason: "Voltron aura" },
    { role: "Evasion", query: "o:'unblockable' or o:'can't be blocked'", reason: "Get damage through" },
  ],
  aristocrats: [
    { role: "Sac Outlets", query: "o:'sacrifice a creature:'", reason: "Free sacrifice outlet" },
    { role: "Death Triggers", query: "(o:'whenever a creature you control dies' or o:'whenever another creature you control dies')", reason: "Triggers on death" },
  ],
  blink: [
    { role: "Blink Effects", query: "o:'exile target creature' o:'return that card to the battlefield'", reason: "Blink trigger" },
    { role: "ETB Creatures", query: "t:creature o:'when' o:'enters the battlefield'", reason: "ETB payoff" },
  ],
  mill: [
    { role: "Mill", query: "(o:'mill' or o:'puts the top') -t:land", reason: "Mill effect" },
  ],
  draw: [
    { role: "Card Draw", query: "o:'draw' (t:instant or t:sorcery) cmc<=3", reason: "Repeatable draw" },
  ],
  control: [
    { role: "Counterspells", query: "o:'counter target spell'", reason: "Stack control" },
    { role: "Removal", query: "o:'destroy target' (t:instant or t:sorcery)", reason: "Permanent removal" },
  ],
  treasure: [
    { role: "Treasure Makers", query: "o:'create' o:'treasure'", reason: "Treasure tokens" },
  ],
  infect: [
    { role: "Proliferate", query: "o:proliferate", reason: "Add poison counters" },
    { role: "Infect Creatures", query: "o:infect or o:toxic", reason: "Infect threats" },
  ],
};

export async function themedRecommendations(themes: string[], allowed: Set<Color>, max = 40): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  const idQ = colorIdentityQuery(allowed);
  const seen = new Set<string>();
  let rank = 1;
  for (const theme of themes) {
    if (theme.startsWith("tribal:")) {
      const subtype = theme.slice(7);
      try {
        const list = await scryfall.searchCards(`t:${subtype} ${idQ} legal:commander`, { order: "edhrec" });
        for (const c of list.data.slice(0, 12)) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          out.push({
            card: c,
            reason: `Tribal ${subtype}: synergistic creature`,
            source: "theme",
            section: `Tribal: ${subtype}`,
            rank: rank++,
          });
        }
      } catch {}
      continue;
    }
    const queries = THEME_QUERIES[theme];
    if (!queries) continue;
    for (const q of queries) {
      try {
        const list = await scryfall.searchCards(`${q.query} ${idQ} legal:commander`, { order: "edhrec" });
        for (const c of list.data.slice(0, 6)) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          out.push({ card: c, reason: `${theme}: ${q.reason}`, source: "theme", section: q.role, rank: rank++ });
        }
        if (out.length >= max) return out.slice(0, max);
      } catch {}
    }
  }
  return out.slice(0, max);
}

export async function commanderRecommendations(
  commander: Card,
  partner?: Card,
  opts: { themes?: string[]; max?: number } = {},
): Promise<Recommendation[]> {
  const max = opts.max ?? 200;
  const allowed = commanderColorIdentity(commander, partner);
  const recs: Recommendation[] = [];
  const seen = new Set<string>();
  let globalRank = 1;

  // 1) EDHREC commander page — the most authoritative source for "what others play."
  const page = await edhrec.commanderPage(commander.name);
  if (page) {
    const flat = edhrec.flattenRecs(page);
    // Collect all EDHREC card names then batch-fetch via /cards/collection
    // instead of N+1 individual cardByName calls.
    type MetaEntry = { name: string; section: string; synergy?: number; inclusion?: number };
    const allMeta: MetaEntry[] = [];
    for (const grp of flat) {
      for (const c of grp.cards.slice(0, 24)) {
        allMeta.push({ name: c.name, section: grp.section, synergy: c.synergy, inclusion: c.inclusion });
      }
    }
    const nameToMeta = new Map<string, MetaEntry>();
    const identifiers: { name: string }[] = [];
    for (const m of allMeta) {
      if (!nameToMeta.has(m.name)) {
        nameToMeta.set(m.name, m);
        identifiers.push({ name: m.name });
      }
    }
    try {
      const fetched = await scryfall.collection(identifiers);
      for (const card of fetched) {
        if (seen.has(card.id)) continue;
        if (card.legalities.commander !== "legal") continue;
        if (card.color_identity.some((ci) => !allowed.has(ci))) continue;
        seen.add(card.id);
        const meta = nameToMeta.get(card.name);
        const section = meta?.section ?? "EDHREC";
        const synergy = meta?.synergy;
        const inclusion = meta?.inclusion;
        recs.push({
          card,
          reason: synergy != null
            ? `EDHREC ${section} · synergy ${(synergy * 100).toFixed(0)}%`
            : `EDHREC ${section}`,
          source: "edhrec",
          section,
          synergy,
          inclusion,
          rank: globalRank++,
        });
      }
    } catch {
      // Collection fetch failed — fall through to theme/staple recs
    }
  }

  // 2) Theme-targeted searches
  if (recs.length < max) {
    const themes = opts.themes ?? detectThemes(commander);
    const themed = await themedRecommendations(themes, allowed, 40);
    for (const t of themed) {
      if (seen.has(t.card.id)) continue;
      seen.add(t.card.id);
      recs.push({ ...t, rank: globalRank++ });
    }
  }

  // 3) Format staples to fill the rest
  if (recs.length < max) {
    const staples = await staplesFor(allowed, max - recs.length);
    for (const s of staples) {
      if (seen.has(s.card.id)) continue;
      seen.add(s.card.id);
      recs.push({ ...s, rank: globalRank++ });
    }
  }

  return recs.slice(0, max);
}

// "Find me a commander" — search legal commanders matching keywords/themes.
export async function searchCommanders(query: string, max = 30): Promise<Card[]> {
  const q = `(t:legendary t:creature or o:"can be your commander") legal:commander ${query}`.trim();
  const list = await scryfall.searchCards(q, { order: "edhrec" });
  return list.data.filter(isLegalCommander).slice(0, max);
}
