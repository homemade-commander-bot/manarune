# Manarune

A free, browser-based deck builder, collection tracker, and table-side life tracker for the Magic: The Gathering Commander format.

> Renamed from "Commander Forge" in v1.1.0. Existing localStorage decks migrate forward automatically.

**Use it without an account** — decks and your collection save to localStorage. Optional cloud sync via Supabase for cross-device access.

## What's in the box

### Deck building
- **Tinder-style swipe UI** for high-synergy card recommendations from EDHREC + Scryfall. Session memory ("don't show me this card twice"), randomized order with a re-deal button, deck-composition deficit bias (a deck short on creatures sees creature recs first).
- **Drag-and-drop** any card from the recommendations feed or search results onto the deck list.
- **Swap modal at 100/100** — try to add a card to a full deck (by swiping right, dragging, or clicking + Add) and you get a heuristic-ranked cut suggestion plus a sortable list of every card in the deck if you'd rather pick the cut yourself.
- **Curated by-color staples** for every color identity (Lightning Bolt, Counterspell, Demonic Tutor, Cultivate, Path to Exile, Swords to Plowshares, Sol Ring + Arcane Signet auto-seeded on every new deck, etc.).
- **Two-tier land optimizer** — budget mode (Command Tower, ≤$5 duals, pip-proportional basics) and "I'm Rich" (fetches, original duals, Gaea's Cradle, etc.).
- **Hover-preview everywhere** — every card in every list/grid floats a 320×448 readable preview at the cursor on hover.

### Format awareness
- **Live Commander Brackets estimator (1–5)** based on the WotC RC differentiators (Game Changers count, MLD presence, fast mana density, two-card combos, tutors). Per-category color identity in the stat tiles communicates "this is what makes the deck its bracket" rather than "fix this."
- **Combo piece highlighting** — cards forming one half of a known infinite (Thoracle/Consult, Kiki/Felidar, Heliod/Ballista, Worldgorger lines, Food Chain lines, Exquisite Blood lines, etc.) are flagged in both the decklist and the swipe feed.
- **Strict format validation** — color identity (CR 903.4), singleton with the proper "any number" allow-list (903.5b), 100-card check (903.5), banlist via Scryfall legalities (903.6c), and partner / friends-forever / Doctor's-companion / background pairing.

### Collection
- **Per-printing collection** with foil and non-foil counts, owned-cards value estimate (TCGplayer USD), and group support (Main / Trade binder / Tergrid pile).
- **Fast-add button** sends a card to the user's chosen target group with one click.
- **Filters** — name search, Scryfall syntax search (intersected with collection by `card.id`), set, color identity, value range, sort by name/value/set/recently-added.
- **"Owned only" toggle** on the recommendations feed and swiper to limit suggestions to cards you already have.

### Other
- **Multi-deck library** with profiles, deck duplication, rename, delete (in-app modal, not browser `confirm()`).
- **Card detail modal** with official rulings from Scryfall and TCGplayer / Cardmarket / EDHREC links.
- **Card-type donut chart** in Deck Stats with per-type accent colors tuned for high contrast.
- **Export** to MTGO/Arena `.txt` and Markdown.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 3 · Zustand 5 · Scryfall API · EDHREC unofficial JSON (proxied server-side at `/api/edhrec`) · optional Supabase.

## Local development

```bash
npm install
npm run dev
```

Visit http://localhost:3000.

## Optional: cloud sync

The app works fully without sync. To enable cross-device sync via Supabase:

1. Create a free project at https://supabase.com
2. Project Settings → API → copy URL + `anon` public key
3. Copy `.env.example` to `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. In Supabase SQL editor, run `supabase/schema.sql` to create the tables (`profiles`, `decks`, `collection_entries`, `collection_groups`) with Row Level Security policies.
5. Restart the dev server.

Without these env vars set, the app falls back to localStorage-only mode and the API routes respond `503 sync_not_configured`.

## Deploying to Vercel

```bash
npm i -g vercel
vercel login           # opens a browser for auth
vercel --prod          # one-shot deploy
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel's dashboard (Project Settings → Environment Variables) if you want sync in production.

See `.claude/launch/DEPLOY.md` for the full step-by-step deployment + community-launch playbook.

## Project layout

```
src/
  app/                Next.js App Router pages + API routes
    api/auth/         Bearer-token session verification
    api/decks/        Optional deck sync REST endpoints (RLS-guarded)
    api/edhrec/       Server-side proxy for json.edhrec.com (CORS bypass)
    build/            Deck builder page (3-column: deck list, feed/swipe/search, stats)
    collection/       /collection page with groups, filters, Scryfall search
    commanders/       Commander picker
    profile/          Profile + cloud sync UI + collection summary
    rules/            CR 903 reference
  components/         React components
  lib/                Pure logic — Scryfall client, EDHREC client,
                      commander rules engine, brackets estimator,
                      land optimizer, recommendation pipeline, store,
                      composition targets, drag-and-drop helpers, types.
supabase/
  schema.sql          Tables, triggers, RLS policies for all four tables.
.claude/
  changelog/          Versioned change history
  context/            Per-session context document
  launch/             Drafted MTG community announcement posts + DEPLOY.md
  skills/             Custom Claude Code skills (mtg-head-judge)
```

## Format compliance

The rules engine cites `MTG Comprehensive Rules` sections in code comments; the banlist comes from Scryfall's `legalities.commander` field rather than being hardcoded, so it stays current as Wizards updates the format. The `mtg-head-judge` skill behind any rules questions in this codebase will not invent rulings — it cites primary sources or refuses to answer.

## License

Source available; no warranty. Magic: The Gathering, Commander, and all card names are trademarks of Wizards of the Coast LLC. This application is unofficial and not affiliated with or endorsed by Wizards of the Coast.
