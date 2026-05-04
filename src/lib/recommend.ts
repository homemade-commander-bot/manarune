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
    // Discard / wheels — covers Tergrid, Nath, Notion Thief, Nekusar, etc.
    { theme: "discard", pattern: /opponent discards?|each (player|opponent) discards|discards? a card|discards? .* cards?/ },
    { theme: "wheels", pattern: /each player draws|discard your hand.*draw|discards? their hand/ },
    { theme: "treasure", pattern: /treasure token/ },
    { theme: "energy", pattern: /energy counter|\{e\}/ },
    { theme: "infect", pattern: /infect|toxic|proliferate/ },
    { theme: "extra turns", pattern: /take an extra turn/ },
    // Stax-flavored — taxes, prevents untapping, restricts opponents
    { theme: "stax", pattern: /can't untap|don't untap|each (other )?player can't|opponents can't|skip .* untap step/ },
    // Group hug / forced draw
    { theme: "group hug", pattern: /each player draws|each opponent draws/ },
    // Sacrifice payoffs (slightly distinct from aristocrats: cards that *want* to be sacrificed)
    { theme: "sacrifice", pattern: /sacrifice .* creature.* (you control|:)/ },
    // Bounce / tempo
    { theme: "bounce", pattern: /return target .* to .* owner's hand/ },
    // Landfall
    { theme: "landfall", pattern: /landfall|whenever a land enters/ },
    // Steal / theft
    { theme: "theft", pattern: /gain control of|exchange control|steal/ },
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

export async function staplesFor(allowed: Set<Color>, max = 80): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  const idQ = colorIdentityQuery(allowed);
  const seen = new Set<string>();
  let rank = 1;
  for (const s of STAPLES) {
    try {
      const list = await scryfall.searchCards(`${s.query} ${idQ} legal:commander`, { order: "edhrec" });
      for (const c of list.data.slice(0, 10)) {
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
  // Tergrid-class: force opponents to discard, then punish them.
  discard: [
    { role: "Forced Discard", query: "(o:'target opponent discards' or o:'each opponent discards' or o:'target player discards')", reason: "Force discards" },
    { role: "Discard Punishers", query: "(o:'whenever an opponent discards' or o:'whenever a player discards')", reason: "Triggers when opponents discard" },
    { role: "Hand Hate", query: "(o:'look at target opponent' o:hand or o:'reveal' o:hand) (t:instant or t:sorcery or t:enchantment)", reason: "See/strip opponents' hands" },
    { role: "Recurring Discard", query: "(t:enchantment or t:creature) o:'discards a card'", reason: "Repeatable discard engine" },
    { role: "Wheels", query: "(o:'discard your hand' o:'draws' or o:'each player draws') t:sorcery", reason: "Wheel effects" },
  ],
  wheels: [
    { role: "Wheel Effects", query: "o:'each player' o:'draws' o:'cards'", reason: "Symmetric draw / refill" },
    { role: "Wheel Payoffs", query: "(o:'whenever an opponent draws' or o:'whenever you draw your second card')", reason: "Punish opponent draws" },
  ],
  stax: [
    { role: "Stax Pieces", query: "(o:\"don't untap\" or o:\"can't untap\" or o:'opponents can't' or o:'each opponent skips')", reason: "Restrict opponents" },
    { role: "Tax Effects", query: "(o:'spells cost' o:'more to cast' or o:'an additional' o:'to cast')", reason: "Tax opponents' spells" },
  ],
  "group hug": [
    { role: "Group Hug", query: "(o:'each player draws' or o:'each player may') (t:creature or t:enchantment)", reason: "Forced draw / fixing" },
  ],
  sacrifice: [
    { role: "Free Sac Outlets", query: "o:'sacrifice a creature:' o:add", reason: "Free sacrifice for value" },
    { role: "Treasure / Tokens to Sac", query: "(o:'create' o:'treasure' or o:'create' o:'1/1') -t:land", reason: "Cheap sac fodder" },
  ],
  bounce: [
    { role: "Bounce", query: "o:'return target' o:\"owner's hand\" (t:instant or t:sorcery) cmc<=4", reason: "Tempo bounce" },
  ],
  landfall: [
    { role: "Landfall Payoffs", query: "o:landfall", reason: "Triggers off lands" },
    { role: "Extra Land Drops", query: "(o:'play an additional land' or o:'play two additional lands')", reason: "Trigger landfall more" },
  ],
  theft: [
    { role: "Steal Effects", query: "o:'gain control of target'", reason: "Take opponents' stuff" },
  ],
};

export async function themedRecommendations(themes: string[], allowed: Set<Color>, max = 120): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  const idQ = colorIdentityQuery(allowed);
  const seen = new Set<string>();
  let rank = 1;
  for (const theme of themes) {
    if (theme.startsWith("tribal:")) {
      const subtype = theme.slice(7);
      try {
        const list = await scryfall.searchCards(`t:${subtype} ${idQ} legal:commander`, { order: "edhrec" });
        for (const c of list.data.slice(0, 20)) {
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
        for (const c of list.data.slice(0, 12)) {
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

// Fisher-Yates in-place shuffle. Used to randomize the recommendation
// queue so users don't see the same order every visit.
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function commanderRecommendations(
  commander: Card,
  partner?: Card,
  opts: { themes?: string[]; max?: number; shuffle?: boolean } = {},
): Promise<Recommendation[]> {
  const max = opts.max ?? 400;
  const shuffle = opts.shuffle ?? true;
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
      for (const c of grp.cards.slice(0, 60)) {
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

  // 2) Theme-targeted searches — always run so commander mechanics get
  //    represented even when EDHREC has lots of generic staples.
  const themes = opts.themes ?? detectThemes(commander);
  const themed = await themedRecommendations(themes, allowed, 120);
  for (const t of themed) {
    if (seen.has(t.card.id)) continue;
    seen.add(t.card.id);
    recs.push({ ...t, rank: globalRank++ });
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

  // Shuffle so the user doesn't see the same order every visit. We keep
  // EDHREC-synergy-tagged cards ordered toward the front by bucketing
  // first: high-synergy cards get a partial shuffle of their own bucket
  // so the most-relevant stuff still appears early.
  if (shuffle) {
    const high = recs.filter((r) => (r.synergy ?? 0) >= 0.1);
    const mid = recs.filter((r) => (r.synergy ?? 0) >= 0.02 && (r.synergy ?? 0) < 0.1);
    const themed = recs.filter((r) => r.source === "theme" && !high.includes(r) && !mid.includes(r));
    const rest = recs.filter((r) => !high.includes(r) && !mid.includes(r) && !themed.includes(r));
    shuffleInPlace(high);
    shuffleInPlace(mid);
    shuffleInPlace(themed);
    shuffleInPlace(rest);
    return [...high, ...mid, ...themed, ...rest].slice(0, max);
  }

  return recs.slice(0, max);
}

// "Find me a commander" — search legal commanders matching keywords/themes.
export async function searchCommanders(query: string, max = 30): Promise<Card[]> {
  const q = `(t:legendary t:creature or o:"can be your commander") legal:commander ${query}`.trim();
  const list = await scryfall.searchCards(q, { order: "edhrec" });
  return list.data.filter(isLegalCommander).slice(0, max);
}
