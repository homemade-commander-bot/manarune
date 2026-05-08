"use client";

// Floating card-image preview anchored near the cursor. Used by every
// list/grid that displays cards (decklist, recommendations feed, search
// results, commander picker, land optimizer plan, swap modal, etc.) so
// users can read a card's text without committing to opening the
// CardDetail modal.
//
// Usage in a consumer component:
//
//   const hover = useCardHover();
//   return (
//     <>
//       {items.map((card) => (
//         <button key={card.id} {...hoverProps(card, hover)}>
//           {card.name}
//         </button>
//       ))}
//       <CardHoverLayer hover={hover} />
//     </>
//   );

import { useCallback, useState } from "react";
import { frontImage } from "@/lib/scryfall";
import type { Card } from "@/lib/types";

export interface CardHoverState {
  card: Card | null;
  x: number;
  y: number;
}

export interface CardHover {
  card: Card | null;
  x: number;
  y: number;
  show: (card: Card, e: { clientX: number; clientY: number }) => void;
  move: (e: { clientX: number; clientY: number }) => void;
  hide: () => void;
}

export function useCardHover(): CardHover {
  const [state, setState] = useState<CardHoverState>({ card: null, x: 0, y: 0 });
  const show = useCallback(
    (card: Card, e: { clientX: number; clientY: number }) =>
      setState({ card, x: e.clientX, y: e.clientY }),
    [],
  );
  const move = useCallback(
    (e: { clientX: number; clientY: number }) =>
      setState((s) => (s.card ? { ...s, x: e.clientX, y: e.clientY } : s)),
    [],
  );
  const hide = useCallback(() => setState({ card: null, x: 0, y: 0 }), []);
  return { card: state.card, x: state.x, y: state.y, show, move, hide };
}

// Convenience: spread the result on any element that should bind hover.
//
//   <div {...hoverProps(card, hover)}>...</div>
export function hoverProps(card: Card, hover: CardHover) {
  return {
    onMouseEnter: (e: React.MouseEvent) => hover.show(card, e),
    onMouseMove: (e: React.MouseEvent) => hover.move(e),
    onMouseLeave: () => hover.hide(),
    // Hide the preview while a drag begins — the OS drag image and a
    // floating card preview together is visually cluttered, and the
    // preview's pointer-events:none means it doesn't move with the
    // drag anyway.
    onDragStart: () => hover.hide(),
  };
}

// Render the floating preview. Place once at the root of the
// component that owns the hover state. Returns null when no card is
// hovered, so it costs nothing when idle.
export function CardHoverLayer({ hover }: { hover: CardHover }) {
  if (!hover.card) return null;
  return <CardHoverPreview card={hover.card} cursorX={hover.x} cursorY={hover.y} />;
}

export function CardHoverPreview({
  card,
  cursorX,
  cursorY,
}: {
  card: Card;
  cursorX: number;
  cursorY: number;
}) {
  const img = frontImage(card, "large") ?? frontImage(card, "normal");
  if (!img) return null;

  // Card image is rendered at 320px wide; "large" Scryfall faces are
  // 488×680, so 320 wide → ~446 tall at 5:7. We use 320×448 for math.
  const PREVIEW_W = 320;
  const PREVIEW_H = 448;
  const GAP = 18;
  const VIEWPORT_PAD = 8;

  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;

  // Prefer the right of the cursor; flip to the left if there's no room.
  let left = cursorX + GAP;
  if (left + PREVIEW_W + VIEWPORT_PAD > vw) {
    left = cursorX - GAP - PREVIEW_W;
  }
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  // Vertical: center on cursor, clamped to viewport.
  let top = cursorY - PREVIEW_H / 2;
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;
  if (top + PREVIEW_H + VIEWPORT_PAD > vh) {
    top = vh - PREVIEW_H - VIEWPORT_PAD;
  }

  return (
    <div
      className="fixed pointer-events-none z-[60]"
      style={{ left, top, width: PREVIEW_W }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt=""
        draggable={false}
        className="w-full block rounded-xl shadow-2xl ring-1 ring-amber-700/40"
      />
    </div>
  );
}
