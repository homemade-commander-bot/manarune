# Mobile-app path

Currently the app is a Next.js web app deployed on Vercel and accessible on any phone via a browser. "Mobile app" can mean several things — let me lay out the realistic paths in order of effort, what each unlocks, and what I'd recommend.

## TL;DR

| Path | Effort | Cost | What you get | What you don't |
|---|---|---|---|---|
| **A.** Improve PWA experience | 2–4 days | $0 | Install-to-home-screen on iOS/Android, offline support, app-like UX | Not in App Store / Play Store |
| **B.** Wrap with Capacitor | 1–2 weeks | $124/yr ($99 Apple + $25 once Google) | Real listing on both App Stores. Same React codebase. | Same web UI, slightly slower than native |
| **C.** Rewrite in React Native | 1–3 months | $124/yr + dev time | Best mobile UX, full native API access | Major rewrite, two codebases to maintain |

**My recommendation:** A → B in that order. Path A is mostly free and we should do it regardless. Path B unlocks app stores without throwing away anything we've built. Path C is overkill unless we hit Path B limits (which we won't anytime soon).

---

## Path A — Make it a great PWA (Progressive Web App)

A PWA is a web app that *behaves like* a native app: installs to the home screen with its own icon, runs full-screen without browser chrome, works offline. iOS Safari and Android Chrome both support PWAs. **No app store required.**

### What we need to add

1. **Web app manifest** — `public/manifest.json` declaring name, icons, theme color, display mode (`standalone`), start URL.
2. **Icon set** — 192×192, 256×256, 384×384, 512×512 PNGs for Android. iOS uses Apple Touch Icons at 180×180. Plus a maskable 512×512 for Android adaptive icons.
3. **iOS-specific meta tags** — Apple has its own meta tags for status-bar color, splash screens, and "Add to Home Screen" behavior.
4. **Service worker for offline support** — caches the app shell + recent Scryfall card images + EDHREC proxy responses. Lets the app open and show your decks/collection even with no internet (deck editing works offline; recommendations require connectivity).
5. **Manifest icons sized for app launcher** — including a maskable variant for Android adaptive icons.

### What the user experience becomes

- Visit the site on a phone → tap "Add to Home Screen" in the share menu.
- App icon appears on home screen alongside native apps.
- Tapping the icon launches in fullscreen (no browser URL bar).
- Decks/collection load from localStorage even offline.
- Life tracker works fully offline.
- Recommendations / EDHREC stuff requires internet (no offline fallback worth building).

### Effort

- ~2 days of work for the manifest, service worker, and icon generation.
- ~1 day of testing on iOS Safari + Android Chrome.
- Total: 2–4 days.

### Why this first

It's almost free, doesn't lock us out of any future path, and a well-built PWA passes Apple's and Google's wrappers (Path B) with much higher quality. Skipping PWA work would mean we ship an inferior wrapped app later.

---

## Path B — Wrap with Capacitor for the App Stores

[Capacitor](https://capacitorjs.com) (built by the Ionic team) lets us wrap an existing web app in a native iOS/Android shell. The same React/Next code runs inside a `WKWebView` (iOS) or `WebView` (Android) container. Real app, real install, real app store listing.

### Requirements

- **Apple Developer Program account** — $99/year. Required to ship to the iOS App Store.
- **Google Play Console account** — $25 one-time. Required for Google Play.
- **A Mac** (or rented Mac via [MacInCloud](https://www.macincloud.com), ~$30/month) — Xcode only runs on macOS.
- **Android Studio** — free, runs on any OS.
- **App Store assets** — icon, 5–10 screenshots per platform, app description, privacy policy URL, support URL.

### What changes in the code

- Add Capacitor packages and config (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`).
- Configure Next.js to output a static export (`next build && next export`) since Capacitor doesn't run a Node server.
  - This needs the `/api/*` routes to either move to a deployed Vercel URL (the wrapped app calls our existing Vercel API) or be replaced with client-side Scryfall calls (we already do most of this).
- Add platform splash screens and icons via the Capacitor assets plugin.
- Test on real devices via Xcode and Android Studio.

### The app-store submission

- **Apple App Store** — review takes 24–72 hours typically. Apple is strict about MTG-related apps:
  - Cannot use Wizards of the Coast branding (no MTG logo, no Magic the Gathering in the title).
  - Must clearly state "unofficial fan-made companion app" in the description.
  - Card images from Scryfall are generally OK because Scryfall has agreements with WotC.
  - Likely-approved title: `<App Name>: Commander Deckbuilder` (not "MTG Commander Deckbuilder").
- **Google Play** — less strict. Review is automated + spot-check, typically 1–3 days.

### Effort

- 1–2 weeks for Capacitor integration, splash/icons, asset generation, store metadata.
- Apple may reject the first submission with cosmetic fixes; budget another week.
- Google usually first-pass approves if the description is clean.

### When this is worth doing

After we have:
1. A working PWA (Path A complete).
2. ~500+ active users from web who'd plausibly install an app.
3. A stable feature set so we're not pushing updates daily through Apple's review queue.

---

## Path C — Native React Native rewrite

Rewrite the UI in React Native (or expo). Reuse business logic from `src/lib/`.

### Why we wouldn't do this yet

- Months of work to rebuild every screen.
- Two codebases to maintain (web + RN).
- Marginal UX improvement over a well-built Path B wrapped app.
- Web-and-app feature parity becomes a constant tax.

### When this becomes worth it

- We hit performance walls in WebView (unlikely — the app is light).
- We need deep native integration (camera-based card scanning, AR card overlay, ApplePay for in-app purchases).
- We hit 10k+ DAU and the polish gap matters for retention.

---

## Recommendation + sequencing

1. **Now → 2 weeks:** Path A. Ship the PWA. Free, gives mobile users the "looks like an app" experience, sets us up for Path B.
2. **2–6 months out (if traction warrants it):** Path B. Cost: $99/year + a Mac. Pays off if web traffic justifies the listing.
3. **12+ months out (if scale demands it):** Path C. Don't plan for this; cross the bridge if you reach it.

## Decision points for you

- Do you have a Mac, or are you willing to rent one when we get to Path B?
- Are you OK paying $99/year recurring for the Apple Developer Program?
- For Path B, the App Store name needs to be locked in. The **Rename** doc covers this — pick the new name before submitting to either store.

## What I'd start on this week

If you want to proceed, here's the first concrete chunk of work for Path A:

1. Generate icon set from a single 1024×1024 source SVG/PNG (we'd commission or design this).
2. Write `public/manifest.json` with the proper fields.
3. Add iOS meta tags to `src/app/layout.tsx`.
4. Wire up a service worker via `next-pwa` or the manual approach for App Router.
5. Add an "Install Forge" hint banner that appears for first-visit mobile users.

I can do steps 2–5 immediately; step 1 needs a designed icon (or I can sketch a placeholder with the app's existing `⌬` glyph).
