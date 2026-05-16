# Rename — moving off "Commander Forge"

Research notes from the 2026-05-12 availability check, plus the
updated recommendation.

## What's already out

I checked each top candidate against: web search, iOS App Store,
Google Play, Reddit, Twitter/X, and direct domain probe. Anything
with a real-world MTG-space collision is disqualified.

| Original pick | Status | Why it's out |
|---|---|---|
| **Brewmancer** | ❌ TAKEN | [BrewMancer Woodworks](https://brewmancerwoodworks.com) sells coffee + **Magic: The Gathering** accessories. Same niche, same name. Trademark and branding risk we should not walk into. |
| **Decksmith** | ❌ TAKEN | [Decksmith: MTG Deck Builder](https://apps.apple.com/us/app/decksmith-mtg-deck-builder/id6756268708) is already on the iOS App Store. Scryfall-based collection + deck builder. Direct competitor. |
| **Tomeforge** | ❌ RISKY | "Forge" suffix collides with [MTG Forge](https://card-forge.github.io/forge/), a major open-source MTG rules engine. Search confusion guaranteed. |
| **Spellweave** | ❌ TAKEN | [Spellweave.app](https://spellweave.app) is an existing Commander deck builder. Direct competitor. |
| **Manabrew** | ❌ NOISY | The "brew" naming space is oversaturated — MTG Brew, brewStack, Build and Brew, Mana Brew Shop, etc. all exist. Hard to stand out. |
| **CardNest** | ❌ TAKEN | Used by both a banking app and a trading-card retail site at cardnest.app. |
| **Deckwright** | ⚠ DILUTED | UK decking-product company at deckwright.com + Instagram. Different industry so no MTG trademark conflict, but `.com` is taken and brand isn't unique. |

## What's clear

After thorough checking, only these stand out as having **zero MTG-space
collisions, no trademark hits, and no live websites**:

- **Manarune** ✅ — Mana + rune. No app, no business, no trademark hits.
- **Cardloom** ✅ — Card + loom. `.com` is an empty stub; Etsy has unrelated craft listings.
- **Spellrune** ✅ — Spell + rune. Clear but less MTG-specific signal.
- **Oathkit** ✅ — Oath + kit. Clear but feels more like a modular toolkit than a deck builder.
- **Spellpile** ✅ — Spell + pile. Clear but casual.

## ⭐ Recommendation: **Manarune**

Reasons:
- **"Mana" instantly signals MTG** to any player.
- **"Rune" implies a mystical mark / inscription** — fits a deck-building, collection-tracking, life-tracking app perfectly (your deck is your signature mark on the format).
- Two syllables: *MAH-na-roon*. Rolls off the tongue.
- Sounds like one word — passes the "feels coined and intentional" test.
- Distinct in MTG space — no apps, no businesses, no trademarks.
- Brandable as a verb too: "I run my list through Manarune."

Domain candidates to grab (priority order):
- `manarune.app` — best for a web app, easy to remember
- `manarune.gg` — gaming-focused TLD, common in the MTG community
- `manarune.com` — broad, professional (may need verification — connection probes were inconclusive)

Backup picks if Manarune doesn't feel right:
- **Cardloom** — second choice, less natural-sounding but completely free
- **Spellrune** — generic-magical feel, less MTG-anchored
- **Oathkit** — flat, modular feel
- **Spellpile** — casual, "your pile of brews"

## Before I do the rename

You need to do three things I can't:

1. **Buy the domain.** Go to Namecheap, Cloudflare Registrar, or Vercel
   Domains and search for `manarune.app` (and `manarune.gg`,
   `manarune.com`). The first one available, grab. Probably $12–$30/yr.

2. **Reserve the social handles.** Even if you don't post yet:
   - `@manarune` on Twitter/X
   - `@manarune` on Instagram
   - `r/manarune` on Reddit (request the subreddit when account is 30 days old)

3. **Search the iOS App Store and Google Play app on your phone.** I
   couldn't find a `manarune` app via search but Apple and Google have
   apps that don't always surface in web indexes. A direct search in
   the store apps is the final check.

If all three look clean, give me the go and I'll execute the rename
in one commit (full checklist below).

## Renaming checklist (one commit, ~1 hour)

| File | Change |
|---|---|
| `package.json` | `"name": "manarune"` |
| `README.md` | All references throughout |
| `.claude/changelog/CHANGELOG.md` | Header + new "Renamed to Manarune" v1.1.0 entry |
| `.claude/launch/*.md` | All four community-post drafts |
| `src/app/layout.tsx` | `<title>`, default description, OG metadata |
| `src/components/Header.tsx` | Visual logo text + responsive variant |
| `src/lib/store.ts` | localStorage key → `manarune-v1` with a v6 migration that copies old `mtg-commander-deck-builder` data on first load |
| `supabase/schema.sql` | Comment header |
| `src/app/api/edhrec/[...slug]/route.ts` | User-Agent string sent to upstream |
| `src/app/api/import/moxfield/[id]/route.ts` | User-Agent string |
| `docs/ARCHITECTURE.md` | References |
| Vercel project | Rename in dashboard (URL preserved as alias) |
| GitHub repo | Rename `commander-forge` → `manarune` (GitHub auto-redirects the old URL for ~1 year) |

The localStorage migration is the only piece with risk. The migration
reads both old and new keys on rehydrate; if the new key is empty and
the old key has data, it copies forward. Existing users keep all their
decks and collection seamlessly.

## My recommended next step

Tell me to **proceed with Manarune**, or pick a backup. Once we lock
in the name I'll do the full rename commit and we can move on to the
PWA work (Path A in `MOBILE-APP.md`).
