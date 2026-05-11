// EDHREC unofficial JSON endpoints. EDHREC does not publish a versioned API,
// but their site backs every page with a JSON resource at the same path.
// We use it to fetch commander recommendations and theme synergies.
//
// EDHREC does NOT send Access-Control-Allow-Origin headers, so direct
// browser fetches are blocked by CORS. We route everything through our
// own /api/edhrec/[...slug] proxy which fetches server-side and caches.
//
// Failures here NEVER break the app — recommendations are "nice to have,"
// and we always fall back to a Scryfall heuristic search.

// Browser → use the proxy. Server (during SSR) → call EDHREC directly.
const BASE =
  typeof window === "undefined"
    ? "https://json.edhrec.com/pages"
    : "/api/edhrec";

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
  // Strip the back face of double-faced cards. Scryfall returns DFC names
  // joined with " // " (e.g. "Tergrid, God of Fright // Tergrid's Lantern"),
  // but EDHREC's URL only uses the front face. Without this, DFC
  // commanders 404 the proxy.
  const frontFace = name.split("//")[0]?.trim() ?? name;
  return frontFace
    .toLowerCase()
    .replace(/[,'’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Build the URL for either the proxy (browser, no .json suffix) or the
// upstream (server, with .json suffix).
function url(path: string): string {
  return typeof window === "undefined"
    ? `${BASE}/${path}.json`
    : `${BASE}/${path}`;
}

export const edhrec = {
  async commanderPage(commanderName: string): Promise<EdhrecCommanderPage | null> {
    const s = slug(commanderName);
    return safeFetch<EdhrecCommanderPage>(url(`commanders/${s}`));
  },

  async themePage(commanderName: string, theme: string): Promise<EdhrecCommanderPage | null> {
    const cs = slug(commanderName);
    const ts = slug(theme);
    return safeFetch<EdhrecCommanderPage>(url(`commanders/${cs}/${ts}`));
  },

  // Top-X average decks (no commander). Useful for color-staple seeds.
  async colorPage(colorCode: string): Promise<EdhrecCommanderPage | null> {
    return safeFetch<EdhrecCommanderPage>(url(`top/${slug(colorCode)}`));
  },

  // Top commanders across the format. Used by the landing page's
  // "Trending Commanders" strip. EDHREC's /top/commanders page lists
  // commanders by current popularity ranking.
  async topCommanders(): Promise<EdhrecCommanderPage | null> {
    return safeFetch<EdhrecCommanderPage>(url("top/commanders"));
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
