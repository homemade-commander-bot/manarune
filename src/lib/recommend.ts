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

// Curated Commander format staples, by color. These are the cards the
// format actually treats as "automatic includes" — high-frequency picks
// across nearly every deck of that color, regardless of strategy. The
// previous heuristic-query version of this list returned generic results
// (e.g. any "destroy target creature" instant) which under-surfaced the
// actual canonical staples like Swords to Plowshares, Counterspell,
// Lightning Bolt, Cultivate, etc.
//
// Filtered downstream by `card.color_identity ⊆ allowed` so a mono-blue
// deck never sees Lightning Bolt. Lands are deliberately excluded —
// the LandOptimizer handles those separately.
type StapleGroup = { role: string; cards: string[] };

const STAPLES_COLORLESS: StapleGroup[] = [
  { role: "Ramp", cards: [
    "Sol Ring", "Arcane Signet", "Mind Stone", "Commander's Sphere",
    "Wayfarer's Bauble", "Solemn Simulacrum", "Burnished Hart",
    "Thought Vessel", "Fellwar Stone",
  ] },
  { role: "Card Draw", cards: ["Skullclamp", "Sensei's Divining Top", "Mind's Eye"] },
  { role: "Protection", cards: ["Lightning Greaves", "Swiftfoot Boots"] },
];

const STAPLES_W: StapleGroup[] = [
  { role: "Removal", cards: ["Swords to Plowshares", "Path to Exile", "Generous Gift"] },
  { role: "Board Wipe", cards: ["Wrath of God", "Day of Judgment", "Farewell", "Cleansing Nova", "Akroma's Vengeance"] },
  { role: "Card Advantage", cards: ["Esper Sentinel", "Smothering Tithe", "Land Tax"] },
  { role: "Tutor", cards: ["Enlightened Tutor"] },
  { role: "Protection", cards: ["Teferi's Protection", "Flawless Maneuver"] },
];

const STAPLES_U: StapleGroup[] = [
  { role: "Counterspell", cards: [
    "Counterspell", "Negate", "Swan Song", "An Offer You Can't Refuse",
    "Force of Will", "Force of Negation", "Fierce Guardianship", "Mana Drain", "Pact of Negation",
  ] },
  { role: "Card Advantage", cards: [
    "Rhystic Study", "Mystic Remora", "Consecrated Sphinx",
    "Brainstorm", "Ponder", "Preordain",
  ] },
  { role: "Removal", cards: ["Cyclonic Rift", "Pongify", "Rapid Hybridization", "Reality Shift"] },
  { role: "Tutor", cards: ["Mystical Tutor"] },
];

const STAPLES_B: StapleGroup[] = [
  { role: "Removal", cards: ["Toxic Deluge", "Damnation", "Deadly Rollick", "Dismember", "Doom Blade", "Go for the Throat", "Feed the Swarm"] },
  { role: "Tutor", cards: ["Demonic Tutor", "Vampiric Tutor", "Diabolic Intent"] },
  { role: "Reanimation", cards: ["Reanimate", "Animate Dead", "Necromancy", "Victimize"] },
  { role: "Card Draw", cards: [
    "Necropotence", "Phyrexian Arena", "Bolas's Citadel",
    "Black Market Connections", "Sign in Blood", "Read the Bones", "Bone Miser",
  ] },
  { role: "Win Condition", cards: ["Gray Merchant of Asphodel", "Ad Nauseam", "Exsanguinate"] },
  { role: "Ramp", cards: ["Dark Ritual", "Cabal Ritual"] },
];

const STAPLES_R: StapleGroup[] = [
  { role: "Removal", cards: ["Chaos Warp", "Vandalblast", "Blasphemous Act", "Abrade", "By Force"] },
  { role: "Burn", cards: ["Lightning Bolt"] },
  { role: "Card Draw", cards: ["Wheel of Fortune", "Faithless Looting", "Reforge the Soul", "Magus of the Wheel"] },
  { role: "Tutor", cards: ["Gamble"] },
  { role: "Ramp", cards: ["Dockside Extortionist", "Jeska's Will"] },
  { role: "Recursion", cards: ["Past in Flames", "Underworld Breach"] },
  { role: "Protection", cards: ["Deflecting Swat", "Red Elemental Blast", "Pyroblast"] },
];

const STAPLES_G: StapleGroup[] = [
  { role: "Ramp", cards: [
    "Cultivate", "Kodama's Reach", "Three Visits", "Nature's Lore",
    "Farseek", "Rampant Growth", "Birds of Paradise", "Llanowar Elves",
    "Sakura-Tribe Elder", "Wood Elves", "Skyshroud Claim", "Explosive Vegetation",
  ] },
  { role: "Removal", cards: ["Beast Within", "Krosan Grip", "Reclamation Sage", "Force of Vigor", "Nature's Claim"] },
  { role: "Card Advantage", cards: ["Sylvan Library", "Greater Good", "Beast Whisperer", "Guardian Project", "Harmonize"] },
  { role: "Tutor", cards: ["Worldly Tutor", "Survival of the Fittest", "Green Sun's Zenith"] },
  { role: "Recursion", cards: ["Eternal Witness", "Regrowth"] },
  { role: "Protection", cards: ["Heroic Intervention", "Veil of Summer"] },
];

export const STAPLES_BY_COLOR: { C: StapleGroup[]; W: StapleGroup[]; U: StapleGroup[]; B: StapleGroup[]; R: StapleGroup[]; G: StapleGroup[] } = {
  C: STAPLES_COLORLESS,
  W: STAPLES_W,
  U: STAPLES_U,
  B: STAPLES_B,
  R: STAPLES_R,
  G: STAPLES_G,
};

export async function staplesFor(allowed: Set<Color>, max = 80): Promise<Recommendation[]> {
  // Build the candidate set: colorless staples (always) + per-color
  // staples for every color in the allowed identity. Each card is
  // tagged with its role so the recommendation reason is meaningful.
  const namesNeeded: string[] = [];
  const nameToRole = new Map<string, string>();
  const seenName = new Set<string>();
  const enroll = (groups: StapleGroup[]) => {
    for (const g of groups) {
      for (const name of g.cards) {
        if (seenName.has(name)) continue;
        seenName.add(name);
        namesNeeded.push(name);
        nameToRole.set(name, g.role);
      }
    }
  };
  enroll(STAPLES_BY_COLOR.C);
  if (allowed.has("W")) enroll(STAPLES_BY_COLOR.W);
  if (allowed.has("U")) enroll(STAPLES_BY_COLOR.U);
  if (allowed.has("B")) enroll(STAPLES_BY_COLOR.B);
  if (allowed.has("R")) enroll(STAPLES_BY_COLOR.R);
  if (allowed.has("G")) enroll(STAPLES_BY_COLOR.G);

  if (namesNeeded.length === 0) return [];

  const out: Recommendation[] = [];
  let rank = 1;
  try {
    const fetched = await scryfall.collection(
      namesNeeded.map((name) => ({ name })),
    );
    for (const card of fetched) {
      // Defensive filter: Scryfall name resolution can occasionally
      // return a card whose color identity exceeds the deck's (e.g.
      // a reprint with a flavor word that bumps identity). Skip those.
      if (card.legalities.commander !== "legal") continue;
      if (card.color_identity.some((ci) => !allowed.has(ci))) continue;
      const role = nameToRole.get(card.name) ?? "Staple";
      out.push({
        card,
        reason: `${role}: format staple`,
        source: "staple",
        section: role,
        rank: rank++,
      });
      if (out.length >= max) break;
    }
  } catch {
    // Network or upstream failure — return whatever we have so the
    // rest of the recommendation pipeline still works.
  }
  return out;
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
  const idQ = colorIdentityQuery(allowed);

  // Build the full list of (query, label) jobs up front, then fire them
  // ALL concurrently. The global Scryfall throttle still staggers the
  // request *starts* by 100ms, but the network round-trips overlap, so
  // a commander with 5 detected themes (≈10 queries) goes from
  // ~10×(throttle+latency) sequential to roughly 10×throttle + one
  // latency — typically a 4-6× wall-clock speedup on this stage.
  type Job = { query: string; section: string; reason: string; take: number };
  const jobs: Job[] = [];
  for (const theme of themes) {
    if (theme.startsWith("tribal:")) {
      const subtype = theme.slice(7);
      jobs.push({
        query: `t:${subtype} ${idQ} legal:commander`,
        section: `Tribal: ${subtype}`,
        reason: `Tribal ${subtype}: synergistic creature`,
        take: 20,
      });
      continue;
    }
    const queries = THEME_QUERIES[theme];
    if (!queries) continue;
    for (const q of queries) {
      jobs.push({
        query: `${q.query} ${idQ} legal:commander`,
        section: q.role,
        reason: `${theme}: ${q.reason}`,
        take: 12,
      });
    }
  }

  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        const list = await scryfall.searchCards(job.query, { order: "edhrec" });
        return list.data.slice(0, job.take).map((card) => ({ card, job }));
      } catch {
        return [];
      }
    }),
  );

  // Flatten + dedupe in job order so the first theme's hits rank highest.
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  let rank = 1;
  for (const batch of results) {
    for (const { card, job } of batch) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      out.push({ card, reason: job.reason, source: "theme", section: job.section, rank: rank++ });
      if (out.length >= max) return out.slice(0, max);
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

// EDHREC commander page → recommendations. Extracted so the three
// recommendation sources can be fired concurrently from
// commanderRecommendations. Filters to the deck's color identity and
// commander-legal cards.
export async function edhrecRecommendations(
  commander: Card,
  allowed: Set<Color>,
): Promise<Recommendation[]> {
  const page = await edhrec.commanderPage(commander.name);
  if (!page) return [];
  const flat = edhrec.flattenRecs(page);
  type MetaEntry = { name: string; section: string; synergy?: number; inclusion?: number };
  const nameToMeta = new Map<string, MetaEntry>();
  const identifiers: { name: string }[] = [];
  for (const grp of flat) {
    for (const c of grp.cards.slice(0, 60)) {
      if (!nameToMeta.has(c.name)) {
        nameToMeta.set(c.name, { name: c.name, section: grp.section, synergy: c.synergy, inclusion: c.inclusion });
        identifiers.push({ name: c.name });
      }
    }
  }
  const out: Recommendation[] = [];
  try {
    const fetched = await scryfall.collection(identifiers);
    let rank = 1;
    for (const card of fetched) {
      if (card.legalities.commander !== "legal") continue;
      if (card.color_identity.some((ci) => !allowed.has(ci))) continue;
      const meta = nameToMeta.get(card.name);
      const section = meta?.section ?? "EDHREC";
      const synergy = meta?.synergy;
      out.push({
        card,
        reason: synergy != null
          ? `EDHREC ${section} · synergy ${(synergy * 100).toFixed(0)}%`
          : `EDHREC ${section}`,
        source: "edhrec",
        section,
        synergy,
        inclusion: meta?.inclusion,
        rank: rank++,
      });
    }
  } catch {
    // Collection fetch failed — caller falls back to theme/staple recs.
  }
  return out;
}

export async function commanderRecommendations(
  commander: Card,
  partner?: Card,
  opts: {
    themes?: string[];
    max?: number;
    shuffle?: boolean;
    // Called after each source resolves with the cumulative deduped
    // list so far. Lets the UI render EDHREC results immediately
    // (~3-5s) instead of blocking on themes + staples (~20-30s).
    // Only fired in source order: EDHREC → themes → staples.
    onStage?: (recsSoFar: Recommendation[]) => void;
  } = {},
): Promise<Recommendation[]> {
  const max = opts.max ?? 400;
  const shuffle = opts.shuffle ?? true;
  const allowed = commanderColorIdentity(commander, partner);
  const themes = opts.themes ?? detectThemes(commander);

  // Fire all three sources CONCURRENTLY. Wall-clock time becomes the
  // slowest single source rather than the sum of all three.
  const edhrecP = edhrecRecommendations(commander, allowed);
  const themesP = themedRecommendations(themes, allowed, 120);
  const staplesP = staplesFor(allowed, max);

  const recs: Recommendation[] = [];
  const seen = new Set<string>();
  let globalRank = 1;

  const ingest = (incoming: Recommendation[]) => {
    for (const r of incoming) {
      if (seen.has(r.card.id)) continue;
      if (r.card.color_identity.some((ci) => !allowed.has(ci))) continue;
      seen.add(r.card.id);
      recs.push({ ...r, rank: globalRank++ });
    }
  };

  // Await + render in priority order. EDHREC is the most authoritative,
  // so we surface it first; themes and staples are already in flight and
  // append as they land.
  ingest(await edhrecP);
  opts.onStage?.(recs.slice());

  ingest(await themesP);
  opts.onStage?.(recs.slice());

  ingest(await staplesP);
  opts.onStage?.(recs.slice());

  // Shuffle (SwipeFeed path) so the user doesn't see the same order every
  // visit. The Feed passes shuffle:false because it has its own sort.
  if (shuffle) {
    const high: Recommendation[] = [];
    const mid: Recommendation[] = [];
    const themed: Recommendation[] = [];
    const rest: Recommendation[] = [];
    for (const r of recs) {
      const s = r.synergy ?? 0;
      if (s >= 0.1) high.push(r);
      else if (s >= 0.02) mid.push(r);
      else if (r.source === "theme") themed.push(r);
      else rest.push(r);
    }
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
