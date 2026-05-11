"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeckStore } from "@/lib/store";
import { totalCards, deckPriceUsd } from "@/lib/analytics";
import { validateDeck, colorIdentityString, commanderColorIdentity } from "@/lib/commander-rules";
import { frontImage } from "@/lib/scryfall";
import { ColorIdentityPips } from "./ManaCost";
import { ConfirmDialog } from "./ConfirmDialog";

export function DeckLibrary() {
  const router = useRouter();
  const { profile, decks, createDeck, deleteDeck, duplicateDeck, setActiveDeck } = useDeckStore();
  const list = Object.values(decks).sort((a, b) => b.updatedAt - a.updatedAt);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  function startNew() {
    const id = createDeck("Untitled Deck");
    setActiveDeck(id);
    router.push("/commanders");
  }

  return (
    <div className="max-w-[1500px] mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
      <section className="panel p-4 sm:p-6 grain">
        {/* Mobile: stack avatar above name above buttons; desktop:
            avatar/name | buttons in a row. The previous layout
            clipped "+ New Commander Deck" on small screens. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="text-4xl sm:text-5xl flex-shrink-0">{profile.avatar}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] sm:text-xs uppercase tracking-widest text-zinc-400">Welcome back</div>
              <h1 className="font-display text-2xl sm:text-3xl bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent truncate">
                {profile.name}
              </h1>
              <div className="text-xs sm:text-sm text-zinc-400 mt-1">
                {list.length} {list.length === 1 ? "deck" : "decks"} in your library
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
            <button onClick={startNew} className="btn btn-primary flex-1 sm:flex-initial justify-center">
              <span className="sm:hidden">+ New Deck</span>
              <span className="hidden sm:inline">+ New Commander Deck</span>
            </button>
            <Link href="/profile" className="btn btn-ghost flex-1 sm:flex-initial justify-center">
              Edit profile
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-2xl text-amber-300">Your decks</h2>
          {list.length > 0 && (
            <Link href="/commanders" className="text-sm text-amber-400 hover:underline">
              Browse commanders →
            </Link>
          )}
        </div>

        {list.length === 0 ? (
          <div className="panel p-12 text-center">
            <div className="text-6xl mb-3">🎴</div>
            <h3 className="font-display text-xl text-amber-300 mb-1">No decks yet</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Pick a commander to start brewing. The recommendation feed builds itself around your choice.
            </p>
            <button onClick={startNew} className="btn btn-primary">Choose Your First Commander</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {list.map((deck) => {
              const cmd = deck.commanderId ? deck.entries[deck.commanderId]?.card : undefined;
              const partner = deck.partnerId ? deck.entries[deck.partnerId]?.card : undefined;
              const art = cmd ? frontImage(cmd, "art_crop") : undefined;
              const total = totalCards(deck);
              const issues = validateDeck(deck);
              const errors = issues.filter((i) => i.level === "error").length;
              const ci = commanderColorIdentity(cmd, partner);
              const ciStr = colorIdentityString(ci);
              const price = deckPriceUsd(deck);

              return (
                <div key={deck.id} className="panel overflow-hidden feed-card flex flex-col">
                  <button
                    onClick={() => {
                      setActiveDeck(deck.id);
                      router.push("/build");
                    }}
                    className="block w-full text-left"
                  >
                    <div className="commander-banner aspect-[16/9] bg-bg-raised relative">
                      {art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={art} alt={cmd!.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
                          No commander chosen
                        </div>
                      )}
                      <div className="absolute bottom-2 left-3 right-3 z-10 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-display text-lg text-white truncate drop-shadow">
                            {deck.name}
                          </div>
                          <div className="text-xs text-zinc-300 truncate">{cmd?.name ?? "No commander"}</div>
                        </div>
                        <ColorIdentityPips colors={Array.from(ci)} />
                      </div>
                    </div>
                  </button>
                  <div className="p-3 flex items-center gap-2 text-xs">
                    <span className={total === 100 ? "text-emerald-400" : "text-zinc-400"}>
                      {total}/100
                    </span>
                    <span className="text-zinc-500">·</span>
                    <span className="text-zinc-400">{ciStr || "C"}</span>
                    <span className="text-zinc-500">·</span>
                    <span className="text-emerald-400">${price.toFixed(0)}</span>
                    {errors > 0 && (
                      <span className="ml-auto chip text-red-400 border-red-700/40">
                        {errors} {errors === 1 ? "issue" : "issues"}
                      </span>
                    )}
                    {errors === 0 && total === 100 && (
                      <span className="ml-auto chip text-emerald-400 border-emerald-700/40">Legal</span>
                    )}
                  </div>
                  <div className="px-3 pb-3 flex gap-1">
                    <button
                      onClick={() => {
                        setActiveDeck(deck.id);
                        router.push("/build");
                      }}
                      className="btn btn-primary flex-1 justify-center text-xs py-1"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => duplicateDeck(deck.id)}
                      className="btn btn-ghost text-xs py-1"
                      title="Duplicate"
                    >
                      ⎘
                    </button>
                    <button
                      onClick={() => setPendingDelete({ id: deck.id, name: deck.name })}
                      className="btn btn-ghost text-xs py-1 hover:!text-red-400"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete deck?"
        message={pendingDelete ? `"${pendingDelete.name}" will be permanently removed. This cannot be undone.` : ""}
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteDeck(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
