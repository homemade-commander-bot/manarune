// Lightweight HTML5 drag-and-drop helpers for moving cards between
// the recommendation grids / search results / commander picker into
// the active deck list.
//
// Why HTML5 native and not react-dnd / dnd-kit:
//   - We only need source → drop-target with a single payload type.
//     The native DataTransfer is sufficient and ships zero bytes.
//   - Keeps mobile fall-through clean: native drag ignores touch,
//     which is fine because mobile users have the swipe / tap-to-add
//     paths already.
//   - No new runtime deps.
//
// Wire format: we serialize the entire Card object as JSON and put it
// under our private MIME type. The whole card is small (a few KB) and
// it lets the drop target add the card without a Scryfall round-trip.

import type { Card } from "./types";

export const CARD_MIME = "application/x-mtg-commander-card";

export function dragSourceProps(card: Card): React.HTMLAttributes<HTMLElement> & {
  draggable: true;
} {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      // Stash a JSON-encoded copy of the card. Browsers also expose a
      // text/plain fallback by convention so other apps see something
      // sensible if the card is dropped outside our app.
      try {
        e.dataTransfer.setData(CARD_MIME, JSON.stringify(card));
      } catch {
        // setData can throw under file:// or some sandboxed contexts.
        // Falling through to text/plain is fine.
      }
      e.dataTransfer.setData("text/plain", card.name);
      e.dataTransfer.effectAllowed = "copy";
    },
  };
}

// Read the card payload out of a drop event. Returns null if the event
// doesn't carry a card (e.g. user dragged a file in by accident).
export function readDroppedCard(e: React.DragEvent): Card | null {
  const raw = e.dataTransfer.getData(CARD_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Defensive: confirm the bare minimum of the Card shape is present
    // before we hand it back. Anything past `id` is checked by callers.
    if (parsed && typeof parsed.id === "string" && typeof parsed.name === "string") {
      return parsed as Card;
    }
  } catch {
    // ignore
  }
  return null;
}

// Convenience: returns drop-target props that call onDrop with the
// parsed card and prevent the default behavior (which would otherwise
// navigate the browser to the dropped data).
export function dropTargetProps(
  onCard: (card: Card) => void,
  opts: { onDragEnter?: () => void; onDragLeave?: () => void } = {},
): React.HTMLAttributes<HTMLElement> {
  return {
    onDragOver: (e) => {
      // Must call preventDefault on dragover for drop to fire.
      if (e.dataTransfer.types.includes(CARD_MIME)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    },
    onDragEnter: () => opts.onDragEnter?.(),
    onDragLeave: () => opts.onDragLeave?.(),
    onDrop: (e) => {
      e.preventDefault();
      const card = readDroppedCard(e);
      if (card) onCard(card);
      opts.onDragLeave?.();
    },
  };
}
