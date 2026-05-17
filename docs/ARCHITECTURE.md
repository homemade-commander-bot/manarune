# Architecture

A friend dev raised the concern that "the frontend and backend aren't separated." This document explains the actual layering, where the concern is right, where it's overstated, and how the code is organized so that someone joining the project doesn't have to read every file to find the seams.

## TL;DR

Manarune (formerly Commander Forge) is a **single Next.js 15 App Router project** with:

- **Pure-logic libraries** under `src/lib/` — no React, no Next.js. Take inputs, return outputs. These could be lifted into a separate package tomorrow with zero changes.
- **React components** under `src/components/` — read from a Zustand store and call lib functions. No direct HTTP calls except where wrapped through `src/lib/scryfall.ts` / `src/lib/edhrec.ts`.
- **Server-side API routes** under `src/app/api/` — thin proxies + Supabase wrappers. No business logic.
- **Pages** under `src/app/*/page.tsx` — mostly mount a component and pass it props from `useDeckStore`.

The "frontend" and "backend" are separated by URL and runtime: anything in `src/app/api/` runs on the Vercel serverless edge (Node.js); everything else is a React component (client or server-rendered). They communicate only through HTTP + JSON, never by shared in-memory state.

What the friend may have noticed is something different and real: **the Zustand store is the only persistence layer right now**. There is no service layer between components and storage — components import the store and mutate it directly. That's deliberate and well-suited for the current "local-only" architecture; it would need an abstraction if/when cloud sync becomes the primary path.

## Layer-by-layer tour

```
┌─────────────────────────────────────────────────────────────────┐
│                       BROWSER (React)                            │
│                                                                  │
│  src/app/*/page.tsx                                              │
│       ↓ mounts                                                   │
│  src/components/*.tsx                                            │
│       ↓ reads / writes via                                       │
│  src/lib/store.ts        (Zustand + localStorage)                │
│       ↓ uses utility from                                        │
│  src/lib/*.ts            (PURE: rules, brackets, lands,          │
│                           composition, recommend, import, etc.)  │
│       ↓ may fetch via                                            │
│  src/lib/scryfall.ts                                             │
│  src/lib/edhrec.ts                                               │
└─────────────────────────────────────────────────────────────────┘
                              ▲ HTTP only
┌─────────────────────────────────────────────────────────────────┐
│              VERCEL EDGE (Node.js serverless)                    │
│                                                                  │
│  src/app/api/edhrec/[...slug]/route.ts    (CORS proxy)           │
│  src/app/api/import/moxfield/[id]/route.ts (CORS proxy)          │
│  src/app/api/auth/session/route.ts        (Supabase Bearer auth) │
│  src/app/api/decks/route.ts               (Supabase CRUD)        │
│  src/app/api/decks/[id]/route.ts          (Supabase CRUD)        │
│       ↓ uses                                                     │
│  src/lib/supabase-server.ts                                      │
│       ↓ talks to                                                 │
│  Supabase (Postgres + Auth + RLS)                                │
└─────────────────────────────────────────────────────────────────┘
```

### `src/lib/` — pure, testable logic (no React)

These files don't import React, Next.js, or any UI library. They take typed inputs and return typed outputs. You could `import { estimateBracket } from "@/lib/brackets"` from a CLI script and it would work.

| File | Responsibility |
|---|---|
| `types.ts` | Shared TS types (Card, Deck, DeckEntry, Color, etc.) |
| `scryfall.ts` | Scryfall REST client with throttling, dedupe, batched POSTs |
| `edhrec.ts` | EDHREC unofficial JSON client (browser → `/api/edhrec` proxy; server → direct) |
| `commander-rules.ts` | CR §903 validation — color identity, singleton, banlist, partner/background |
| `brackets.ts` | WotC bracket estimator (Game Changers, tutors, MLD, combos) |
| `analytics.ts` | Mana curve, color pip counts, type breakdown, deck value |
| `lands.ts` | Land optimizer + new-deck staple seeding + suggest-cut heuristic |
| `composition.ts` | Per-type target counts + deficit tiers for swiper bias |
| `recommend.ts` | EDHREC + theme + curated-staples merge → ordered Recommendation[] |
| `import.ts` | Decklist text parser + Moxfield URL → ParsedDeck |
| `dnd.ts` | HTML5 drag/drop helpers |
| `export.ts` | Deck → MTGO `.txt` and Markdown |
| `store.ts` | Zustand store. **The one non-pure module** in `lib/`. |
| `supabase.ts` | Client-side Supabase factory (returns null if env vars absent) |
| `supabase-server.ts` | Server-side Supabase factory used by API routes |
| `session.ts` | Client auth helpers (sign-in, sign-out, push/pull deck) |

The dependency rule: **lib files can import from each other; they cannot import from `components/` or `app/`**. Components and routes import lib; lib never imports back.

### `src/components/` — React UI

Stateless or store-connected presentational components. They read application state via `useDeckStore` and mutate via store actions; they call lib functions for derived data.

```tsx
// Typical component shape
import { useDeckStore } from "@/lib/store";
import { estimateBracket } from "@/lib/brackets";

export function BracketEstimator({ deck }: { deck: Deck }) {
  const est = estimateBracket(deck);  // pure function, no side effects
  return <div>...</div>;
}
```

Components never call `fetch` directly to Scryfall or EDHREC. They go through `scryfall.searchCards` / `scryfall.collection` / `scryfall.cardByName` etc.

### `src/app/api/` — server-side

Each API route is a thin layer over either an external service or Supabase. No business logic.

```ts
// src/app/api/decks/route.ts (sketch)
export async function POST(req: Request) {
  const sb = getServerSupabase(bearerFromRequest(req));
  if (!sb) return NextResponse.json({ error: "sync_not_configured" }, { status: 503 });
  const { data: user } = await sb.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { deck } = await req.json();
  const { error } = await sb.from("decks").upsert({ ... });
  return error ? NextResponse.json({ error: error.message }, { status: 500 })
               : NextResponse.json({ ok: true });
}
```

### Pages

`src/app/*/page.tsx` files are barely more than `<Component />` mounts. They handle routing and SEO metadata; everything else lives in components.

## What "front/back not separated" usually means

If your friend is coming from a SPA + REST background, "separation" might mean:

1. **The frontend and backend are different processes/repos.** ✅ Already true in deployment — Vercel runs the React build on the CDN, the API routes on serverless functions. Same monorepo, but cleanly separated runtimes.
2. **There's a service/repository layer between UI and storage.** ❌ Not really. Components import `useDeckStore` directly. This is normal for a Zustand app and not a problem at current scale, but if cloud sync becomes the primary persistence path we'd want a repository pattern:

   ```ts
   // future shape if/when sync goes mainstream:
   interface DeckRepository {
     list(): Promise<Deck[]>;
     get(id: string): Promise<Deck | null>;
     save(deck: Deck): Promise<void>;
     delete(id: string): Promise<void>;
   }
   class LocalDeckRepository implements DeckRepository { /* uses store */ }
   class CloudDeckRepository implements DeckRepository { /* uses /api/decks */ }
   ```

   Components would then receive a `DeckRepository` via context, and the choice of storage would be a swap at the root of the tree.

3. **The frontend and backend share types.** ✅ True — both sides import from `src/lib/types.ts`. That's an asset, not a coupling concern. TypeScript shared types between frontend and backend is desirable; it's the runtime coupling (shared mutable state across the wire) that you want to avoid.

## What's deliberately fused right now

- **Zustand store ↔ components**: Components reach into the store directly. Acceptable while localStorage is the only persistence; a clear refactor target if/when Supabase sync becomes default.
- **API routes ↔ Supabase**: Routes contain Supabase calls directly rather than going through a repository. Acceptable while we have one backend (Supabase). If we ever needed to support, say, Postgres-direct or a different auth provider, we'd extract.
- **Lib functions ↔ Scryfall response shape**: `Card` in `types.ts` is essentially the Scryfall shape. We don't have a "domain model" separate from the API DTOs. Pragmatic for a deckbuilder; bad if we ever started mixing card data from multiple sources.

## Refactor backlog (when scale demands it)

These aren't urgent — the current shape is appropriate for a single-author project with one storage backend. But they're worth noting:

1. **Repository layer** for decks/collection, with a `LocalRepository` and `CloudRepository` implementation, picked based on session state. Would clean up the `useDeckStore` ↔ `/api/decks` split that exists today (components write to store, but the store also pushes to API on debounce — there's an implicit "the store knows about sync" coupling in `CloudSync.tsx`).

2. **Domain types separate from Scryfall DTOs.** Right now `Deck.entries` carries the full Scryfall `Card` object. Cheaper than re-fetching, but bloats localStorage and the network payload. A trimmed `DeckCard` shape with only the fields the app reads would help.

3. **State machines for multi-step flows.** The commander picker `pick()` function has a manual decision tree (replace flow vs fill-empty vs create-new). If we add more such flows, an explicit state machine library (xstate) would prevent silent bugs.

4. **End-to-end tests.** No Playwright/Cypress today. Manual smoke tests after every change. Worth adding once feature velocity slows and bug-prevention becomes more valuable than feature-adding velocity.

## Summary for the friend dev

> "Frontend and backend not separated" is true if you mean "one repo, one Next.js app, no service layer between UI and store." It is not true if you mean "the wire format is shared mutable state" or "the React code talks to the database directly" — there's a clean HTTP boundary at `/api/*`, server-only Supabase access, and lib functions are pure and React-free. The current coupling between components and the Zustand store is intentional for a localStorage-first app and would be the first thing we refactor when cloud sync becomes the primary path.
