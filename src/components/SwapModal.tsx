"use client";

// "Deck full" swap prompt. Shown when the user tries to add a card to
// a deck that's already at 100/100 — whether by swiping right in the
// SwipeFeed, by clicking +Add anywhere, or by dragging a card onto the
// DeckList drop zone. The modal suggests a cut (heuristic: cards
// ranked by suggestCut() in lib/lands.ts) and lets the user accept,
// pick a different card from the deck, or skip the incoming card.
//
// Hover-preview integrated: hovering either side card or any row in
// the "choose a different card to cut" list floats a 320px card image
// near the cursor so the user can read the cards before deciding.
// The preview is portaled to document.body via CardHoverLayer so it
// can never be trapped by a parent's stacking context (the DeckList
// panel uses backdrop-filter which would otherwise contain a
// fixed-positioned preview to its own box).

import { useState } from "react";
import type { Card, Deck, DeckEntry } from "@/lib/types";
import { deckEntries } from "@/lib/analytics";
import { frontImage } from "@/lib/scryfall";
import { CardHoverLayer, useCardHover } from "./CardHoverPreview";

interface Props {
  incomingCard: Card;
  suggestedCut: DeckEntry;
  deck: Deck;
  onSwap: (cutCardId: string) => void;
  onSkip: () => void;
  onCancel: () => void;
  onInspect: (c: Card) => void;
}

export function SwapModal({
  incomingCard,
  suggestedCut,
  deck,
  onSwap,
  onSkip,
  onCancel,
  onInspect,
}: Props) {
  const [customPick, setCustomPick] = useState(false);
  const hover = useCardHover();
  const entries = deckEntries(deck).filter(
    (e) => e.cardId !== deck.commanderId && e.cardId !== deck.partnerId,
  );

  // Local aliases keep the JSX below readable. These delegate to the
  // portaled hover state so the preview floats over document.body.
  const showPreview = (card: Card, e: React.MouseEvent) => hover.show(card, e);
  const movePreview = (e: React.MouseEvent) => hover.move(e);
  const hidePreview = () => hover.hide();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="panel max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <h3 className="font-display text-xl text-violet-400">Deck Full (100/100)</h3>
          <p className="text-zinc-400 text-sm mt-1">
            Want to swap a card to make room for{" "}
            <span className="text-violet-300 font-semibold">{incomingCard.name}</span>?
          </p>
          <p className="text-[10px] text-zinc-500 mt-1">Hover any card to preview it.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 text-center">
            <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Remove</div>
            <div
              className="bg-red-900/20 border border-red-800/40 rounded p-2 cursor-pointer hover:border-red-600/60 transition"
              onClick={() => onInspect(suggestedCut.card)}
              onMouseEnter={(e) => showPreview(suggestedCut.card, e)}
              onMouseMove={movePreview}
              onMouseLeave={hidePreview}
            >
              {frontImage(suggestedCut.card, "small") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frontImage(suggestedCut.card, "small")!}
                  alt={suggestedCut.card.name}
                  className="w-16 h-16 rounded object-cover mx-auto mb-1"
                />
              )}
              <div className="text-xs font-medium truncate">{suggestedCut.card.name}</div>
              <div className="text-[10px] text-zinc-500">{suggestedCut.card.type_line.split(" — ")[0]}</div>
              <div className="text-[10px] text-zinc-500">CMC {suggestedCut.card.cmc}</div>
            </div>
          </div>

          <div className="text-2xl text-violet-400">→</div>

          <div className="flex-1 text-center">
            <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Add</div>
            <div
              className="bg-emerald-900/20 border border-emerald-800/40 rounded p-2 cursor-pointer hover:border-emerald-600/60 transition"
              onClick={() => onInspect(incomingCard)}
              onMouseEnter={(e) => showPreview(incomingCard, e)}
              onMouseMove={movePreview}
              onMouseLeave={hidePreview}
            >
              {frontImage(incomingCard, "small") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frontImage(incomingCard, "small")!}
                  alt={incomingCard.name}
                  className="w-16 h-16 rounded object-cover mx-auto mb-1"
                />
              )}
              <div className="text-xs font-medium truncate">{incomingCard.name}</div>
              <div className="text-[10px] text-zinc-500">{incomingCard.type_line.split(" — ")[0]}</div>
              <div className="text-[10px] text-zinc-500">CMC {incomingCard.cmc}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onSwap(suggestedCut.cardId)}
            className="btn btn-primary flex-1 justify-center"
          >
            Swap
          </button>
          <button onClick={onSkip} className="btn btn-ghost flex-1 justify-center">
            Skip card
          </button>
        </div>

        <button
          onClick={() => setCustomPick((v) => !v)}
          className="text-[11px] text-zinc-400 hover:text-zinc-200 underline w-full text-center"
        >
          {customPick ? "Hide deck list" : "Choose a different card to cut"}
        </button>

        {customPick && (
          <div className="max-h-48 overflow-y-auto border border-bg-border rounded">
            {entries
              .sort((a, b) => b.card.cmc - a.card.cmc || a.card.name.localeCompare(b.card.name))
              .map((e) => (
                <button
                  key={e.cardId}
                  onClick={() => onSwap(e.cardId)}
                  onMouseEnter={(ev) => showPreview(e.card, ev)}
                  onMouseMove={movePreview}
                  onMouseLeave={hidePreview}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-bg-raised transition text-left"
                >
                  <span className="text-zinc-500 w-6 text-right">{e.card.cmc}</span>
                  <span className="flex-1 truncate">{e.card.name}</span>
                  <span className="text-[10px] text-zinc-500 truncate max-w-[100px]">
                    {e.card.type_line.split(" — ")[0]}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      <CardHoverLayer hover={hover} />
    </div>
  );
}
