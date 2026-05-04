# Commander Forge

A free, browser-based deck builder for the Magic: The Gathering Commander format.

**Use it without an account** — decks save to localStorage. Optional cloud sync via Supabase if you want cross-device access.

## What's in the box

- **Tinder-style swipe UI** for high-synergy card recommendations from EDHREC + Scryfall.
- **Combo piece highlighting** — cards that form one half of a known infinite combo (Thoracle/Consult, Kiki/Felidar, Heliod/Ballista, Worldgorger lines, Food Chain lines, etc.) are flagged in your decklist and swipe feed.
- **Live Commander Brackets estimator (1–5)** based on the WotC RC differentiators (Game Changers count, MLD presence, fast mana density, two-card combos).
- **Two-tier land optimizer** — budget mode (Command Tower, ≤$5 duals, pip-proportional basics) and "I'm Rich" (fetches, original duals, Gaea's Cradle, etc.).
- **Strict format validation** — color identity (CR 903.4), singleton with the proper "any number" allow-list (903.5b), 100-card check (903.5), banlist via Scryfall legalities (903.6c), and partner / friends-forever / Doctor's-companion / background pairing.
- **Multi-deck library** with profiles, deck duplication, rename, delete.
- **Card detail modal** with official rulings (Scryfall) and TCGplayer / Cardmarket / EDHREC links.
- **Export** to MTGO/Arena `.txt` and Markdown.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 3 · Zustand · Scryfall API · EDHREC unofficial JSON · optional Supabase.

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
4. In Supabase SQL editor, run `supabase/schema.sql` to create the tables and Row Level Security policies.
5. Restart the dev server.

Without these env vars set, the app falls back to localStorage-only mode and the API routes respond `503 sync_not_configured`.

## Deploying to Vercel

```bash
npm i -g vercel
vercel login           # opens a browser for auth
vercel --prod          # one-shot deploy
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel's dashboard (Project Settings → Environment Variables) if you want sync in production.

## Project layout

```
src/
  app/                Next.js App Router pages + API routes
    api/decks/        Optional sync REST endpoints (RLS-guarded)
    api/auth/         Session verification
  components/         React components
  lib/                Pure logic — Scryfall client, EDHREC client,
                      commander rules engine, brackets estimator,
                      land optimizer, store, types.
supabase/
  schema.sql          Tables, triggers, RLS policies
.claude/
  changelog/          Versioned change history
  context/            Per-session context document
  launch/             Drafted MTG community announcement posts
  skills/             Custom Claude Code skills
```

## Format compliance

The rules engine cites `MTG Comprehensive Rules` sections in code comments; the banlist comes from Scryfall's `legalities.commander` field rather than being hardcoded, so it stays current as Wizards updates the format. The `mtg-head-judge` skill behind any rules questions in this codebase will not invent rulings — it cites primary sources or refuses to answer.

## License

Source available; no warranty. Magic: The Gathering, Commander, and all card names are trademarks of Wizards of the Coast LLC. This application is unofficial and not affiliated with or endorsed by Wizards of the Coast.
