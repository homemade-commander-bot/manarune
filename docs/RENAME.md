# Rename — moving off "Commander Forge"

## Why

- "Commander Forge" is generic enough that other MTG sites and tools already use the phrase (search results show overlap).
- For a community launch, the name has to be **unambiguous** so people can find us, remember us, and trust they're on the right URL.
- App stores reject look-alikes; better to start with something distinct.

## Criteria (user-stated)

- One word OR a smashed-together compound that reads as one word
- Rolls off the tongue
- Conveys purpose without explaining itself
- Memorable, brandable, available

## Recommended shortlist

I'm splitting candidates into three buckets: invented compounds, MTG-flavor pulls, and clean one-word picks.

### Top pick: **Brewmancer**

- Compound of "brew" (deck-builder slang) + "necromancer" (magic-fantasy suffix).
- Rolls off the tongue: *BREW-man-sir*. Three syllables, alliterates with "build".
- Conveys purpose immediately to any MTG player: you brew decks, this thing is named after that.
- Likely-available domains: `brewmancer.app`, `brewmancer.gg`, `brewmancer.com` (the last needs a check).
- Branding angle: card-wizard-as-craftsman. Works for both casual ("brewing a fun deck") and competitive ("brewing a tournament list") audiences.

### Strong alternates

- **Decksmith** — Smith + decks. Professional-sounding, evokes craftsmanship. Easy to say. Possibly taken elsewhere; need to verify domains.
- **Tomeforge** — Tome (book of magic) + forge. Sophisticated, evokes library + crafting. Works with the "rules engine + collection" pitch.
- **Manabrew** — Mana + brew. Most-on-the-nose for MTG. Almost too cute but very memorable.
- **Sigil** — Just the one word. Mystical mark / signature. Maps to "your deck is your signature." Very brandable but less self-explanatory.

### MTG-flavor pulls (single common-noun cards)

These piggyback on iconic-card recognition but stand alone as words:

- **Cradle** — like Gaea's Cradle. Implies nurturing/building. `cradle.gg` would be a strong domain.
- **Sanctum** — like Serra's Sanctum. Library-of-knowledge vibe.
- **Reliquary** — like Reliquary Tower. Repository of valuable cards.
- **Pact** — like Pact of Negation. Snappy, two syllables, action-implying.
- **Codex** — book of knowledge. Cataloging vibe matches our collection feature.

### Skipped

- "Forger", "Brewlab", "Spelltable", "Untap" — all already used by MTG-adjacent tools.
- "Stax", "Tutor" — too overloaded with MTG-specific meaning.
- "Manarock", "Mainboard" — generic format jargon.

## Verification before committing

Before I rename anything in code, you should:

1. **Domain availability** — check the `.app`, `.gg`, and `.com` for the top 1–2 picks. Suggested registrar: Vercel itself (one-click setup post-purchase) or Namecheap.
2. **App store name collision** — search the iOS App Store and Google Play for the chosen name. If a similar app exists, our submission may be rejected.
3. **GitHub repo name** — verify the org doesn't have a collision.
4. **Social handles** — quickly check Twitter/X and Reddit for `r/<name>`.

## Renaming checklist (once a name is chosen)

This is the work I'd do in one commit:

- `package.json` → `"name": "<new-name>"`
- `README.md` → references throughout
- `.claude/changelog/CHANGELOG.md` → header
- `.claude/launch/*.md` → drafts mention the name
- `src/app/layout.tsx` → `<title>`, default description, OG metadata
- `src/components/Header.tsx` → visual logo text
- `src/lib/store.ts` → localStorage key (with a migration so existing users don't lose data)
- `supabase/schema.sql` → comment header
- `next.config.mjs` → User-Agent strings sent to Scryfall / EDHREC
- Vercel project name → rename in dashboard (URL preserved)
- GitHub repo → rename (GitHub auto-redirects the old URL for ~1 year)

Total work: ~1 hour. The localStorage migration is the only piece with any risk; everything else is text replacement.

## My recommendation

**Brewmancer** — invented compound, easy to say, instantly meaningful to MTG players, very unlikely to collide with existing brands. If `brewmancer.app` is available, that's the call.

Fallback: **Decksmith** (less unique but very clear) or **Cradle** (one syllable, evocative, requires no explanation).
