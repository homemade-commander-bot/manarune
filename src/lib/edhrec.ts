// EDHREC unofficial JSON endpoints. EDHREC does not publish a versioned API,
// but their site backs every page with a JSON resource at the same path.
// We use it to fetch commander recommendations and theme synergies.
//
// Failures here NEVER break the app — recommendations are "nice to have,"
// and we always fall back to a Scryfall heuristic search.

const BASE = "https://json.edhrec.com/pages";

export interface EdhrecCardRef {
  name: string;
  url?: string;
  num_decks?: number;
  potential_decks?: number;
  synergy?: number;
  inclusion?: number;
  sanitized?: string;
  sanitized_wo?: string;
  label?: string;
}

export interface EdhrecCardlist {
  header: string;
  tag?: string;
  cardviews: EdhrecCardRef[];
}

export interface EdhrecCommanderPage {
  container?: {
    json_dict?: {
      cardlists?: EdhrecCardlist[];
      card?: { name?: string };
    };
  };
  panels?: {
    tribelinks?: { themes?: { value: string; href: string; count: number }[] };
  };
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,'’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "MTG-Commander-Deck-Builder/0.2" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const edhrec = {
  async commanderPage(commanderName: string): Promise<EdhrecCommanderPage | null> {
    const s = slug(commanderName);
    return safeFetch<EdhrecCommanderPage>(`${BASE}/commanders/${s}.json`);
  },

  async themePage(commanderName: string, theme: string): Promise<EdhrecCommanderPage | null> {
    const cs = slug(commanderName);
    const ts = slug(theme);
    return safeFetch<EdhrecCommanderPage>(`${BASE}/commanders/${cs}/${ts}.json`);
  },

  // Top-X average decks (no commander). Useful for color-staple seeds.
  async colorPage(colorCode: string): Promise<EdhrecCommanderPage | null> {
    return safeFetch<EdhrecCommanderPage>(`${BASE}/top/${slug(colorCode)}.json`);
  },

  flattenRecs(page: EdhrecCommanderPage): { section: string; cards: EdhrecCardRef[] }[] {
    const lists = page.container?.json_dict?.cardlists ?? [];
    return lists.map((l) => ({ section: l.header, cards: l.cardviews ?? [] }));
  },

  themesOf(page: EdhrecCommanderPage): { name: string; href: string; count: number }[] {
    return (page.panels?.tribelinks?.themes ?? []).map((t) => ({
      name: t.value,
      href: t.href,
      count: t.count,
    }));
  },
};
