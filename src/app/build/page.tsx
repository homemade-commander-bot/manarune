"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { CardSearch } from "@/components/CardSearch";
import { DeckList } from "@/components/DeckList";
import { DeckStats } from "@/components/DeckStats";
import { CardDetail } from "@/components/CardDetail";
import { RecommendationsFeed } from "@/components/RecommendationsFeed";
import { SwipeFeed } from "@/components/SwipeFeed";
import { BracketEstimator } from "@/components/BracketEstimator";
import { LandOptimizer } from "@/components/LandOptimizer";
import { DeckActions } from "@/components/DeckActions";
import { CommanderBanner } from "@/components/CommanderBanner";
import { ImportDeckModal } from "@/components/ImportDeckModal";
import { useDeckStore } from "@/lib/store";
import type { Card } from "@/lib/types";

type Tab = "feed" | "swipe" | "search";
// On screens narrower than `lg` we collapse the 3-column desktop
// layout into a single column with tabs to switch between sections.
// All three sections still mount simultaneously on lg+.
type MobileSection = "deck" | "build" | "stats";

export default function BuildPage() {
  const { decks, activeDeckId } = useDeckStore();
  const deck = activeDeckId ? decks[activeDeckId] : null;
  const [inspect, setInspect] = useState<Card | null>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const [mobileSection, setMobileSection] = useState<MobileSection>("build");
  const [showImport, setShowImport] = useState(false);

  if (!deck) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="panel p-6 sm:p-8 text-center max-w-md w-full">
            <div className="text-4xl mb-2" aria-hidden>🜂</div>
            <h1 className="font-display text-2xl text-violet-400 mb-1">No deck selected</h1>
            <p className="text-zinc-400 text-sm mb-5">
              Start a fresh build by picking a commander, or jump into an existing list.
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/commanders" className="btn btn-primary justify-center">
                Choose a Commander
              </Link>
              <button onClick={() => setShowImport(true)} className="btn btn-ghost justify-center">
                ↓ Import a decklist
              </button>
              <Link href="/" className="btn btn-ghost justify-center">
                My Decks
              </Link>
            </div>
          </div>
        </main>
        <ImportDeckModal open={showImport} onClose={() => setShowImport(false)} />
      </>
    );
  }

  const cmd = deck.commanderId ? deck.entries[deck.commanderId]?.card : undefined;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-[1700px] w-full mx-auto px-2 sm:px-4 py-3">
        <div className="mb-3">
          <CommanderBanner deck={deck} onInspectCommander={() => cmd && setInspect(cmd)} />
        </div>

        {/* Mobile section tabs — hidden at lg+ where the 3-column grid
            shows everything simultaneously. */}
        <div className="lg:hidden flex items-stretch gap-1 panel p-1 mb-2">
          <SectionTab active={mobileSection === "deck"} onClick={() => setMobileSection("deck")}>
            📋 Deck
          </SectionTab>
          <SectionTab active={mobileSection === "build"} onClick={() => setMobileSection("build")}>
            🛠 Build
          </SectionTab>
          <SectionTab active={mobileSection === "stats"} onClick={() => setMobileSection("stats")}>
            📊 Stats
          </SectionTab>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:h-[calc(100vh-260px)] lg:min-h-[600px]">
          <aside
            className={`lg:col-span-3 lg:flex flex-col gap-3 min-h-0 lg:h-full ${
              mobileSection === "deck" ? "flex" : "hidden"
            }`}
          >
            <DeckActions deck={deck} />
            <div className="flex-1 min-h-0 min-h-[60vh] lg:min-h-0">
              <DeckList deck={deck} onInspect={setInspect} />
            </div>
          </aside>

          <section
            className={`lg:col-span-6 lg:flex flex-col gap-2 min-h-0 ${
              mobileSection === "build" ? "flex" : "hidden"
            }`}
          >
            <div className="flex items-center gap-1 panel p-1 self-start">
              <button
                onClick={() => setTab("feed")}
                className={`px-3 sm:px-4 py-1.5 rounded text-sm font-medium transition ${
                  tab === "feed" ? "bg-violet-600 text-white" : "text-zinc-300 hover:bg-bg-raised"
                }`}
              >
                ✦ Feed
              </button>
              <button
                onClick={() => setTab("swipe")}
                className={`px-3 sm:px-4 py-1.5 rounded text-sm font-medium transition ${
                  tab === "swipe" ? "bg-violet-600 text-white" : "text-zinc-300 hover:bg-bg-raised"
                }`}
              >
                ♥ Swipe
              </button>
              <button
                onClick={() => setTab("search")}
                className={`px-3 sm:px-4 py-1.5 rounded text-sm font-medium transition ${
                  tab === "search" ? "bg-violet-600 text-white" : "text-zinc-300 hover:bg-bg-raised"
                }`}
              >
                🔍 Search
              </button>
            </div>
            <div className="flex-1 min-h-[70vh] lg:min-h-0">
              {tab === "feed" && <RecommendationsFeed deck={deck} onInspect={setInspect} />}
              {tab === "swipe" && <SwipeFeed deck={deck} onInspect={setInspect} />}
              {tab === "search" && <CardSearch deck={deck} onInspect={setInspect} />}
            </div>
          </section>

          <aside
            className={`lg:col-span-3 lg:flex flex-col gap-3 min-h-0 lg:overflow-y-auto pr-1 ${
              mobileSection === "stats" ? "flex" : "hidden"
            }`}
          >
            <LandOptimizer deck={deck} onInspect={setInspect} />
            <BracketEstimator deck={deck} />
            <DeckStats deck={deck} />
          </aside>
        </div>
      </main>
      <CardDetail card={inspect} deckId={deck.id} onClose={() => setInspect(null)} />
    </>
  );
}

// Mobile-only section switcher between Deck / Build / Stats columns.
// At lg+ all three columns render simultaneously so this control is
// hidden by its parent's lg:hidden class.
function SectionTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
        active ? "bg-violet-600 text-white" : "text-zinc-300 hover:bg-bg-raised"
      }`}
    >
      {children}
    </button>
  );
}
