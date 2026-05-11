// Deck-list importer. Parses the plain-text formats that every major
// deckbuilder (Moxfield, Archidekt, MTGGoldfish, TappedOut, manual
// paste) supports as their text export, then resolves card names to
// Scryfall records in a single batched POST.
//
// The parser is intentionally permissive: it strips set codes,
// collector numbers, foil markers, comment lines, and section
// headers. It tries to be right about:
//   • Where mainboard ends and sideboard begins (we drop sideboard
//     because Commander doesn't use one)
//   • Where commander(s) live (a "Commander" / "Companion" /
//     "Maybeboard" section, or a `*CMDR*` marker on a card line)
//   • DFC card names ("Tergrid, God of Fright // Tergrid's Lantern")
//     are kept whole so Scryfall's name match finds them
//
// The Scryfall resolution step batches up to 75 names per POST per
// the /cards/collection API, and reports any names that came back
// in `not_found` so the import preview can surface them.

import type { Card } from "./types";
import { scryfall } from "./scryfall";

export interface ParsedEntry {
  quantity: number;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  isCommander?: boolean;
}

export interface ParsedDeck {
  entries: ParsedEntry[];
  commanderNames: string[]; // 0–2 names (allows partner / background)
  warnings: string[];        // unparseable lines
}

export interface ResolvedDeck {
  parsed: ParsedDeck;
  matched: Map<string, Card>;     // lowercase name → Card
  missing: string[];               // names Scryfall didn't recognize
  totalQuantity: number;           // sum of all matched entry quantities
}

// One line: optional leading qty (digits) + name + optional set/coll info.
// We accept the loose patterns every popular exporter emits:
//   "4 Lightning Bolt"
//   "4x Lightning Bolt"
//   "1 Sol Ring (CMR) 286"
//   "1 Sol Ring (CMR) 286 *F*"
//   "1 Sol Ring [CMR] 286"
//   "Sol Ring"
//   "  1   Sol Ring  "
const LINE_RE =
  /^\s*(?:(\d+)x?\s+)?([^()[\]]+?)\s*(?:[([]([A-Za-z0-9]+)[)\]]\s*(\S+)?)?\s*(?:\*[A-Z]+\*\s*)*$/;

// Lines we always skip outright.
const SKIP_LINE_RE = /^\s*(?:\/\/|#|;)/;

// Section markers. Order matters — we check Commander/Companion first
// so an exact-match line like "Commander" doesn't get parsed as a card.
const SECTION_MARKERS: { re: RegExp; section: Section }[] = [
  { re: /^\s*(?:\/\/\s*)?commanders?\s*[:\-]?\s*$/i, section: "commander" },
  { re: /^\s*(?:\/\/\s*)?companion\s*[:\-]?\s*$/i, section: "ignore" },
  { re: /^\s*(?:\/\/\s*)?sideboard\s*[:\-]?\s*$/i, section: "ignore" },
  { re: /^\s*(?:\/\/\s*)?maybeboard\s*[:\-]?\s*$/i, section: "ignore" },
  { re: /^\s*(?:\/\/\s*)?(?:deck|main\s*deck|mainboard|main)\s*[:\-]?\s*$/i, section: "main" },
  { re: /^\s*(?:\/\/\s*)?tokens?\s*[:\-]?\s*$/i, section: "ignore" },
];

type Section = "main" | "commander" | "ignore";

export function parseTextDecklist(text: string): ParsedDeck {
  const entries: ParsedEntry[] = [];
  const commanderNames: string[] = [];
  const warnings: string[] = [];
  let section: Section = "main";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (SKIP_LINE_RE.test(line)) continue;

    // Section change?
    const marker = SECTION_MARKERS.find((m) => m.re.test(line));
    if (marker) {
      section = marker.section;
      continue;
    }

    if (section === "ignore") continue;

    // Some Moxfield/Archidekt exports inline the commander on the same
    // line as the section marker: "Commander: Tergrid, God of Fright".
    const inlineCmd = line.match(/^\s*commanders?\s*[:\-]\s*(.+)$/i);
    if (inlineCmd) {
      const parsed = parseLine(inlineCmd[1]);
      if (parsed) {
        commanderNames.push(parsed.name);
      } else {
        warnings.push(line);
      }
      continue;
    }

    // Some exports mark the commander on the card line:
    //   "1 Tergrid, God of Fright *CMDR*"
    const cmdrMarker = /\*(?:CMDR|COMMANDER)\*/i;
    const hasCmdrMarker = cmdrMarker.test(line);
    const cleaned = line.replace(cmdrMarker, "").trim();

    const parsed = parseLine(cleaned);
    if (!parsed) {
      warnings.push(line);
      continue;
    }

    if (section === "commander" || hasCmdrMarker) {
      if (!commanderNames.includes(parsed.name)) {
        commanderNames.push(parsed.name);
      }
      continue;
    }

    entries.push(parsed);
  }

  return { entries, commanderNames, warnings };
}

function parseLine(line: string): ParsedEntry | null {
  const m = line.match(LINE_RE);
  if (!m) return null;
  const [, qty, name, set, coll] = m;
  const cleanName = name.replace(/\s+/g, " ").trim();
  if (!cleanName) return null;
  return {
    quantity: qty ? Math.max(1, parseInt(qty, 10)) : 1,
    name: cleanName,
    setCode: set?.toUpperCase(),
    collectorNumber: coll,
  };
}

// Resolve every parsed name against Scryfall in one or more batched
// /cards/collection POSTs. Returns a matched map (lowercase name → Card)
// plus a list of names that didn't resolve.
export async function resolveDeck(parsed: ParsedDeck): Promise<ResolvedDeck> {
  const allNames = new Set<string>();
  for (const c of parsed.commanderNames) allNames.add(c);
  for (const e of parsed.entries) allNames.add(e.name);

  const namesArr = Array.from(allNames);
  const matched = new Map<string, Card>();
  const missing: string[] = [];

  // Scryfall caps /cards/collection at 75 identifiers per request.
  for (let i = 0; i < namesArr.length; i += 75) {
    const batch = namesArr.slice(i, i + 75);
    try {
      const cards = await scryfall.collection(batch.map((name) => ({ name })));
      const got = new Set<string>();
      for (const card of cards) {
        matched.set(card.name.toLowerCase(), card);
        got.add(card.name.toLowerCase());
      }
      for (const requested of batch) {
        if (!got.has(requested.toLowerCase())) missing.push(requested);
      }
    } catch {
      for (const n of batch) missing.push(n);
    }
  }

  const totalQuantity = parsed.entries.reduce((s, e) => {
    return s + (matched.has(e.name.toLowerCase()) ? e.quantity : 0);
  }, 0) + parsed.commanderNames.filter((n) => matched.has(n.toLowerCase())).length;

  return { parsed, matched, missing, totalQuantity };
}

// ---- URL importers (Moxfield) -------------------------------------------

// Accepts a public Moxfield deck URL or just the deck id. Returns the
// canonical id (the last path segment). Examples:
//   https://moxfield.com/decks/abc123    → "abc123"
//   https://www.moxfield.com/decks/abc123 → "abc123"
//   abc123                                → "abc123"
export function extractMoxfieldId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Bare id (no slashes, looks like an id)
  if (/^[A-Za-z0-9_-]+$/.test(trimmed) && !trimmed.includes("/")) {
    return trimmed;
  }
  // URL form
  const m = trimmed.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

// Fetch a Moxfield deck via our server-side proxy (Moxfield blocks
// browser fetches via CORS). Maps the response shape to ParsedDeck.
export async function fetchMoxfieldDeck(id: string): Promise<ParsedDeck> {
  const res = await fetch(`/api/import/moxfield/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Deck not found. Make sure the deck is public."
        : `Moxfield import failed (${res.status})`,
    );
  }
  const data = (await res.json()) as MoxfieldDeck;
  return moxfieldToParsed(data);
}

// Subset of the Moxfield v3 deck shape we care about. The full payload
// is much bigger; we project only what the importer needs.
interface MoxfieldCardSlot {
  quantity?: number;
  card?: { name?: string; set?: string; cn?: string };
  isFoil?: boolean;
}
type MoxfieldCardMap = Record<string, MoxfieldCardSlot>;

interface MoxfieldBoard {
  count?: number;
  cards?: MoxfieldCardMap;
}

interface MoxfieldDeck {
  name?: string;
  boards?: {
    mainboard?: MoxfieldBoard;
    commanders?: MoxfieldBoard;
    companions?: MoxfieldBoard;
    sideboard?: MoxfieldBoard;
    maybeboard?: MoxfieldBoard;
  };
  // Older v2 shape uses flat keys:
  mainboard?: MoxfieldCardMap;
  commanders?: MoxfieldCardMap;
}

function moxfieldToParsed(deck: MoxfieldDeck): ParsedDeck {
  const entries: ParsedEntry[] = [];
  const commanderNames: string[] = [];
  const warnings: string[] = [];

  const mainboard =
    deck.boards?.mainboard?.cards ??
    deck.mainboard ??
    {};
  const commanders =
    deck.boards?.commanders?.cards ??
    deck.commanders ??
    {};

  for (const slot of Object.values(commanders)) {
    const name = slot.card?.name;
    if (!name) continue;
    if (!commanderNames.includes(name)) commanderNames.push(name);
  }

  for (const slot of Object.values(mainboard)) {
    const name = slot.card?.name;
    if (!name) {
      warnings.push("Skipped a card with no name in Moxfield response");
      continue;
    }
    entries.push({
      quantity: Math.max(1, slot.quantity ?? 1),
      name,
      setCode: slot.card?.set?.toUpperCase(),
      collectorNumber: slot.card?.cn,
    });
  }

  return { entries, commanderNames, warnings };
}
