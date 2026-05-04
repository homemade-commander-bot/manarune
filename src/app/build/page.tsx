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
import { useDeckStore } from "@/lib/store";
import type { Card } from "@/lib/types";

type Tab = "feed" | "swipe" | "search";

export default function BuildPage() {
  const { decks, activeDeckId } = useDeckStore();
  const deck = activeDeckId ? decks[activeDeckId] : null;
  const [inspect, setInspect] = useState<Card | null>(null);
  const [tab, setTab] = useState<Tab>("feed");

  if (!deck) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="panel p-8 text-center max-w-md">
            <h1 className="font-display text-2xl text-amber-400 mb-2">No deck selected</h1>
            <p className="text-zinc-400 text-sm mb-4">Pick a deck from your library or create a new one.</p>
            <div className="flex gap-2 justify-center">
              <Link href="/" className="btn btn-ghost">My Decks</Link>
              <Link href="/commanders" className="btn btn-primary">Choose Commander</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const cmd = deck.commanderId ? deck.entries[deck.commanderId]?.card : undefined;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-[1700px] w-full mx-auto px-4 py-3">
        <div className="mb-3">
          <CommanderBanner deck={deck} onInspectCommander={() => cmd && setInspect(cmd)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-260px)] min-h-[600px]">
          <aside className="lg:col-span-3 flex flex-col gap-3 min-h-0">
            <DeckActions deck={deck} />
            <div className="flex-1 min-h-0">
              <DeckList deck={deck} onInspect={setInspect} />
            </div>
          </aside>

          <section className="lg:col-span-6 flex flex-col gap-2 min-h-0">
            <div className="flex items-center gap-1 panel p-1 self-start">
              <button
                onClick={() => setTab("feed")}
                className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                  tab === "feed" ? "bg-amber-600 text-white" : "text-zinc-300 hover:bg-bg-raised"
                }`}
              >
                ✦ Feed
              </button>
              <button
                onClick={() => setTab("swipe")}
                className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                  tab === "swipe" ? "bg-amber-600 text-white" : "text-zinc-300 hover:bg-bg-raised"
                }`}
              >
                ♥ Swipe
              </button>
              <button
                onClick={() => setTab("search")}
                className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                  tab === "search" ? "bg-amber-600 text-white" : "text-zinc-300 hover:bg-bg-raised"
                }`}
              >
                🔍 Search
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {tab === "feed" && <RecommendationsFeed deck={deck} onInspect={setInspect} />}
              {tab === "swipe" && <SwipeFeed deck={deck} onInspect={setInspect} />}
              {tab === "search" && <CardSearch deck={deck} onInspect={setInspect} />}
            </div>
          </section>

          <aside className="lg:col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
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
