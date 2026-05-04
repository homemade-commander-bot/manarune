// Scryfall API client.
// Docs: https://scryfall.com/docs/api
// Rate limit: 50–100ms between requests, max ~10/sec. We throttle in-flight requests.

import type { Card, Ruling, ScryfallList } from "./types";

const BASE = "https://api.scryfall.com";
const REQUEST_DELAY_MS = 100;

let lastRequestAt = 0;
const inflight = new Map<string, Promise<unknown>>();

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + REQUEST_DELAY_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

// A "no results" search response from Scryfall — used by request() so that
// list-shaped endpoints (search/autocomplete) treat empty matches as
// `{ data: [] }` instead of throwing.
const EMPTY_LIST_PATHS = ["/cards/search", "/cards/autocomplete"];

class ScryfallError extends Error {
  constructor(public status: number, public code: string, public details: string) {
    super(`Scryfall ${status}: ${details || code}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const key = `${init?.method ?? "GET"}:${url}`;
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;

  const promise = (async () => {
    await throttle();
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "User-Agent": "MTG-Commander-Deck-Builder/0.2",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      // Try to read a structured error body. Scryfall returns
      // { object: "error", code: "not_found", details: "..." } as JSON.
      let parsed: { object?: string; code?: string; details?: string } | null = null;
      try {
        parsed = await res.clone().json();
      } catch {
        // not JSON — fall through
      }

      // 404 + not_found on a list-shaped endpoint = empty result, not an error.
      const isListEndpoint = EMPTY_LIST_PATHS.some((p) => path.startsWith(p));
      if (res.status === 404 && parsed?.code === "not_found" && isListEndpoint) {
        return {
          object: "list",
          total_cards: 0,
          has_more: false,
          data: [],
        } as unknown as T;
      }

      throw new ScryfallError(res.status, parsed?.code ?? "http_error", parsed?.details ?? res.statusText);
    }
    return (await res.json()) as T;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

export { ScryfallError };

export const scryfall = {
  // Full text search. q syntax: https://scryfall.com/docs/syntax
  searchCards(
    q: string,
    opts: { unique?: "cards" | "art" | "prints"; order?: string; dir?: "asc" | "desc"; page?: number } = {},
  ): Promise<ScryfallList<Card>> {
    const params = new URLSearchParams({
      q,
      unique: opts.unique ?? "cards",
      order: opts.order ?? "edhrec",
      dir: opts.dir ?? "auto",
      ...(opts.page ? { page: String(opts.page) } : {}),
    });
    return request<ScryfallList<Card>>(`/cards/search?${params}`);
  },

  // Autocomplete name suggestions
  async autocomplete(q: string, opts: { include_extras?: boolean } = {}): Promise<string[]> {
    if (!q.trim()) return [];
    const params = new URLSearchParams({ q });
    if (opts.include_extras) params.set("include_extras", "true");
    const result = await request<{ data: string[] }>(`/cards/autocomplete?${params}`);
    return result.data;
  },

  cardById(id: string): Promise<Card> {
    return request<Card>(`/cards/${id}`);
  },

  cardByName(name: string, exact = true): Promise<Card> {
    const params = new URLSearchParams(exact ? { exact: name } : { fuzzy: name });
    return request<Card>(`/cards/named?${params}`);
  },

  rulingsById(id: string): Promise<ScryfallList<Ruling>> {
    return request<ScryfallList<Ruling>>(`/cards/${id}/rulings`);
  },

  // Used for "find me a commander" — random card matching query.
  random(q?: string): Promise<Card> {
    return request<Card>(q ? `/cards/random?q=${encodeURIComponent(q)}` : `/cards/random`);
  },

  // Bulk fetch via /cards/collection (max 75 identifiers per call).
  // Supports {id}, {name}, or {name, set} identifier shapes per Scryfall docs.
  async collection(identifiers: ({ id: string } | { name: string } | { name: string; set: string })[]): Promise<Card[]> {
    const out: Card[] = [];
    for (let i = 0; i < identifiers.length; i += 75) {
      const slice = identifiers.slice(i, i + 75);
      const result = await request<{ data: Card[] }>(`/cards/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: slice }),
      });
      out.push(...result.data);
    }
    return out;
  },

  // Convenience: get all results across pagination (cap to avoid runaway).
  async searchAll(q: string, max = 175): Promise<Card[]> {
    const cards: Card[] = [];
    let page = 1;
    while (cards.length < max) {
      const list = await this.searchCards(q, { page });
      cards.push(...list.data);
      if (!list.has_more) break;
      page += 1;
    }
    return cards.slice(0, max);
  },
};

// Helpers — no rules invented, all derived from card data.
export function isLegalCommander(card: Card): boolean {
  // A card may be a commander if its type line includes "Legendary Creature",
  // OR if its rules text says "can be your commander", OR it is a Planeswalker
  // printed with the explicit clause. Background partners are themselves not
  // commanders alone, but we surface them via their text.
  const legalInCommander = card.legalities.commander === "legal";
  if (!legalInCommander) return false;
  const types = card.type_line.toLowerCase();
  const text = (card.oracle_text ?? "").toLowerCase();
  if (types.includes("legendary") && types.includes("creature")) return true;
  if (text.includes("can be your commander")) return true;
  // Faces (DFCs / MDFCs)
  if (card.card_faces) {
    return card.card_faces.some((f) => {
      const t = (f.type_line ?? "").toLowerCase();
      const o = (f.oracle_text ?? "").toLowerCase();
      return (t.includes("legendary") && t.includes("creature")) || o.includes("can be your commander");
    });
  }
  return false;
}

export function frontImage(card: Card, size: keyof NonNullable<Card["image_uris"]> = "normal"): string | undefined {
  if (card.image_uris?.[size]) return card.image_uris[size];
  return card.card_faces?.[0]?.image_uris?.[size];
}

export function backImage(card: Card, size: keyof NonNullable<Card["image_uris"]> = "normal"): string | undefined {
  return card.card_faces?.[1]?.image_uris?.[size];
}

export function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
