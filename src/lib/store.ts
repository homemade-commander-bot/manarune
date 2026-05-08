"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Card, Deck, DeckEntry } from "./types";
import { categorize } from "./analytics";
import { isUnlimitedQuantity } from "./commander-rules";

const newDeckId = () => `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const AVATARS = ["🐉", "🧙", "🗡️", "🛡️", "👑", "🔮", "🐺", "🦅", "🦂", "🐍", "🌿", "⚡", "🌑", "☀️", "💀", "🔥"];

export interface Profile {
  name: string;
  avatar: string;
  createdAt: number;
  preferredColors: string[];
  favoriteThemes: string[];
}

const defaultProfile = (): Profile => ({
  name: "Planeswalker",
  avatar: "🧙",
  createdAt: Date.now(),
  preferredColors: [],
  favoriteThemes: [],
});

// A single owned printing, keyed by Scryfall card.id (so different
// printings of the same card are tracked independently). Foil and
// non-foil counts are kept separate because they have different
// market values and most collectors care which they own.
export interface CollectionEntry {
  cardId: string;
  card: Card;
  quantity: number;       // non-foil count
  foilQuantity: number;
  acquiredAt: number;
}

interface DeckStore {
  profile: Profile;
  decks: Record<string, Deck>;
  activeDeckId: string | null;

  // The user's owned-cards collection. Keyed by Scryfall card.id, so
  // multiple printings of the same card live as separate entries (Beta
  // Lightning Bolt vs. M11 Lightning Bolt).
  collection: Record<string, CollectionEntry>;

  // Session-only: card IDs the user has already seen in the SwipeFeed for
  // each deck this session. Cleared on commander change and on full
  // page reload (not persisted). Stored as object so Zustand can serialize.
  swipedIds: Record<string, string[]>;

  setProfile: (patch: Partial<Profile>) => void;
  resetProfile: () => void;

  createDeck: (name?: string) => string;
  duplicateDeck: (id: string) => string | null;
  deleteDeck: (id: string) => void;
  setActiveDeck: (id: string) => void;
  renameDeck: (id: string, name: string) => void;

  setCommander: (deckId: string, card: Card) => void;
  setPartner: (deckId: string, card: Card | null) => void;

  addCard: (deckId: string, card: Card, quantity?: number) => void;
  removeCard: (deckId: string, cardId: string) => void;
  setQuantity: (deckId: string, cardId: string, quantity: number) => void;

  setNotes: (deckId: string, notes: string) => void;
  setThemes: (deckId: string, themes: string[]) => void;

  markSwiped: (deckId: string, cardId: string) => void;
  resetSwiped: (deckId: string) => void;

  addToCollection: (card: Card, quantity?: number, foil?: boolean) => void;
  removeFromCollection: (cardId: string, quantity?: number, foil?: boolean) => void;
  setCollectionQuantity: (cardId: string, quantity: number, foil?: boolean) => void;
  clearCollection: () => void;
}

const emptyDeck = (name = "New Deck"): Deck => ({
  id: newDeckId(),
  name,
  entries: {},
  themes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const AVATAR_OPTIONS = AVATARS;

export const useDeckStore = create<DeckStore>()(
  persist(
    (set, get) => ({
      profile: defaultProfile(),
      decks: {},
      activeDeckId: null,
      collection: {},
      swipedIds: {},

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      resetProfile: () => set({ profile: defaultProfile() }),

      createDeck: (name) => {
        const deck = emptyDeck(name);
        set((s) => ({ decks: { ...s.decks, [deck.id]: deck }, activeDeckId: deck.id }));
        return deck.id;
      },

      duplicateDeck: (id) => {
        const src = get().decks[id];
        if (!src) return null;
        const copy: Deck = {
          ...src,
          id: newDeckId(),
          name: `${src.name} (Copy)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          entries: { ...src.entries },
        };
        set((s) => ({ decks: { ...s.decks, [copy.id]: copy }, activeDeckId: copy.id }));
        return copy.id;
      },

      deleteDeck: (id) =>
        set((s) => {
          const next = { ...s.decks };
          delete next[id];
          return {
            decks: next,
            activeDeckId: s.activeDeckId === id ? (Object.keys(next)[0] ?? null) : s.activeDeckId,
          };
        }),

      setActiveDeck: (id) => set({ activeDeckId: id }),

      renameDeck: (id, name) =>
        set((s) => {
          const deck = s.decks[id];
          if (!deck) return s;
          return { decks: { ...s.decks, [id]: { ...deck, name, updatedAt: Date.now() } } };
        }),

      setCommander: (deckId, card) =>
        set((s) => {
          const deck = s.decks[deckId];
          if (!deck) return s;
          const entries = { ...deck.entries };
          if (deck.commanderId && entries[deck.commanderId]) delete entries[deck.commanderId];
          entries[card.id] = { cardId: card.id, card, quantity: 1, category: "Commander" };
          // Reset swipe history — recommendations will rebuild for the new commander.
          const nextSwiped = { ...(s.swipedIds ?? {}) };
          delete nextSwiped[deckId];
          return {
            decks: {
              ...s.decks,
              [deckId]: { ...deck, commanderId: card.id, entries, updatedAt: Date.now() },
            },
            swipedIds: nextSwiped,
          };
        }),

      setPartner: (deckId, card) =>
        set((s) => {
          const deck = s.decks[deckId];
          if (!deck) return s;
          const entries = { ...deck.entries };
          if (deck.partnerId && entries[deck.partnerId]) delete entries[deck.partnerId];
          if (card) {
            entries[card.id] = { cardId: card.id, card, quantity: 1, category: "Commander" };
          }
          return {
            decks: {
              ...s.decks,
              [deckId]: { ...deck, partnerId: card?.id, entries, updatedAt: Date.now() },
            },
          };
        }),

      addCard: (deckId, card, quantity = 1) =>
        set((s) => {
          const deck = s.decks[deckId];
          if (!deck) return s;
          // Singleton enforcement (CR 903.5b): unless the card is a basic
          // land or an explicit "any number" card (Persistent Petitioners,
          // Relentless Rats, etc.), a deck may have only one card with a
          // given English name. If a different printing of the same card
          // is already in the deck, treat the new add as a no-op rather
          // than creating a second entry that the validator will flag.
          if (!isUnlimitedQuantity(card)) {
            const sameName = Object.values(deck.entries).find(
              (e) => e.card.name === card.name && e.cardId !== card.id,
            );
            if (sameName) return s;
          }
          const existing = deck.entries[card.id];
          const next: DeckEntry = existing
            ? { ...existing, quantity: existing.quantity + quantity }
            : { cardId: card.id, card, quantity, category: categorize(card) };
          return {
            decks: {
              ...s.decks,
              [deckId]: {
                ...deck,
                entries: { ...deck.entries, [card.id]: next },
                updatedAt: Date.now(),
              },
            },
          };
        }),

      removeCard: (deckId, cardId) =>
        set((s) => {
          const deck = s.decks[deckId];
          if (!deck) return s;
          const entries = { ...deck.entries };
          delete entries[cardId];
          const update: Partial<Deck> = { entries, updatedAt: Date.now() };
          if (deck.commanderId === cardId) update.commanderId = undefined;
          if (deck.partnerId === cardId) update.partnerId = undefined;
          return { decks: { ...s.decks, [deckId]: { ...deck, ...update } } };
        }),

      setQuantity: (deckId, cardId, quantity) =>
        set((s) => {
          const deck = s.decks[deckId];
          if (!deck) return s;
          const entry = deck.entries[cardId];
          if (!entry) return s;
          if (quantity <= 0) {
            const entries = { ...deck.entries };
            delete entries[cardId];
            return { decks: { ...s.decks, [deckId]: { ...deck, entries, updatedAt: Date.now() } } };
          }
          return {
            decks: {
              ...s.decks,
              [deckId]: {
                ...deck,
                entries: { ...deck.entries, [cardId]: { ...entry, quantity } },
                updatedAt: Date.now(),
              },
            },
          };
        }),

      setNotes: (deckId, notes) =>
        set((s) => {
          const deck = s.decks[deckId];
          if (!deck) return s;
          return { decks: { ...s.decks, [deckId]: { ...deck, notes, updatedAt: Date.now() } } };
        }),

      setThemes: (deckId, themes) =>
        set((s) => {
          const deck = s.decks[deckId];
          if (!deck) return s;
          return { decks: { ...s.decks, [deckId]: { ...deck, themes, updatedAt: Date.now() } } };
        }),

      markSwiped: (deckId, cardId) =>
        set((s) => {
          const all = s.swipedIds ?? {};
          const existing = all[deckId] ?? [];
          if (existing.includes(cardId)) return s;
          return { swipedIds: { ...all, [deckId]: [...existing, cardId] } };
        }),

      resetSwiped: (deckId) =>
        set((s) => {
          const all = s.swipedIds ?? {};
          const next = { ...all };
          delete next[deckId];
          return { swipedIds: next };
        }),

      addToCollection: (card, quantity = 1, foil = false) =>
        set((s) => {
          const all = s.collection ?? {};
          const existing = all[card.id];
          const next: CollectionEntry = existing
            ? {
                ...existing,
                quantity: foil ? existing.quantity : existing.quantity + quantity,
                foilQuantity: foil ? existing.foilQuantity + quantity : existing.foilQuantity,
              }
            : {
                cardId: card.id,
                card,
                quantity: foil ? 0 : quantity,
                foilQuantity: foil ? quantity : 0,
                acquiredAt: Date.now(),
              };
          return { collection: { ...all, [card.id]: next } };
        }),

      removeFromCollection: (cardId, quantity = 1, foil = false) =>
        set((s) => {
          const all = s.collection ?? {};
          const existing = all[cardId];
          if (!existing) return s;
          const nextQ = foil ? existing.quantity : Math.max(0, existing.quantity - quantity);
          const nextF = foil ? Math.max(0, existing.foilQuantity - quantity) : existing.foilQuantity;
          const next = { ...all };
          if (nextQ === 0 && nextF === 0) {
            delete next[cardId];
          } else {
            next[cardId] = { ...existing, quantity: nextQ, foilQuantity: nextF };
          }
          return { collection: next };
        }),

      setCollectionQuantity: (cardId, quantity, foil = false) =>
        set((s) => {
          const all = s.collection ?? {};
          const existing = all[cardId];
          if (!existing) return s;
          const nextQ = foil ? existing.quantity : Math.max(0, quantity);
          const nextF = foil ? Math.max(0, quantity) : existing.foilQuantity;
          const next = { ...all };
          if (nextQ === 0 && nextF === 0) {
            delete next[cardId];
          } else {
            next[cardId] = { ...existing, quantity: nextQ, foilQuantity: nextF };
          }
          return { collection: next };
        }),

      clearCollection: () => set({ collection: {} }),
    }),
    {
      name: "mtg-commander-deck-builder",
      storage: createJSONStorage(() => localStorage),
      version: 4,
      // swipedIds is intentionally session-only (not persisted) — it's a
      // "don't show me this card twice this session" filter, not user data.
      partialize: (state) => ({
        profile: state.profile,
        decks: state.decks,
        activeDeckId: state.activeDeckId,
        collection: state.collection,
      }),
      migrate: (state: unknown, fromVersion: number) => {
        let s = (state ?? {}) as Partial<DeckStore>;
        if (fromVersion < 2 && !s.profile) {
          s = { ...s, profile: defaultProfile() };
        }
        if (fromVersion < 3 && s.decks) {
          // v3 migration: dedupe duplicate-by-name entries that pre-date
          // the singleton check in addCard. Caused by the seedNewDeckStaples
          // race where two simultaneous calls each fetched a Sol Ring and
          // both added before either had landed in the store. Keeps the
          // first occurrence of each name; drops subsequent duplicates.
          const decks: Record<string, Deck> = {};
          for (const [id, deck] of Object.entries(s.decks)) {
            decks[id] = dedupeDeckByName(deck);
          }
          s = { ...s, decks };
        }
        if (fromVersion < 4 && !s.collection) {
          // v4: introduce the owned-cards collection.
          s = { ...s, collection: {} };
        }
        return s as DeckStore;
      },
      // Belt-and-suspenders: on rehydrate, ensure session-only fields the
      // persisted state doesn't carry (swipedIds) are initialized to safe
      // defaults. Older persisted shapes lack this field; code reads
      // `state.swipedIds[deckId]` and would throw on undefined.
      onRehydrateStorage: () => (state) => {
        if (state && !state.swipedIds) {
          state.swipedIds = {};
        }
        if (state && !state.collection) {
          state.collection = {};
        }
      },
    },
  ),
);

export function activeDeck(s: DeckStore): Deck | null {
  return s.activeDeckId ? (s.decks[s.activeDeckId] ?? null) : null;
}

// ---- Collection selectors ----------------------------------------------

export interface CollectionStats {
  uniqueCards: number;
  totalCards: number;        // includes foil
  estimatedValueUsd: number; // non-foil price + foil price (USD)
}

export function collectionStats(collection: Record<string, CollectionEntry>): CollectionStats {
  let unique = 0;
  let total = 0;
  let value = 0;
  for (const e of Object.values(collection)) {
    const qty = e.quantity + e.foilQuantity;
    if (qty <= 0) continue;
    unique += 1;
    total += qty;
    const usd = parseFloat(e.card.prices?.usd ?? "0") || 0;
    const usdFoil = parseFloat(e.card.prices?.usd_foil ?? e.card.prices?.usd ?? "0") || 0;
    value += e.quantity * usd + e.foilQuantity * usdFoil;
  }
  return { uniqueCards: unique, totalCards: total, estimatedValueUsd: value };
}

// Build a Set of names the user owns ≥1 of (any printing, any finish).
// Cheaper than iterating the collection on every render of every card.
export function ownedCardNames(collection: Record<string, CollectionEntry>): Set<string> {
  const out = new Set<string>();
  for (const e of Object.values(collection)) {
    if (e.quantity + e.foilQuantity > 0) out.add(e.card.name);
  }
  return out;
}

// Drop duplicate-by-name entries from a deck (CR 903.5b), keeping the
// first occurrence by insertion order. Basics and "any number" cards
// (Relentless Rats, etc.) are exempt because the rule allows multiples.
// Used by the v3 migration and also exported so we can call it after a
// suspicious bulk-add.
export function dedupeDeckByName(deck: Deck): Deck {
  if (!deck || !deck.entries) return deck;
  const seen = new Set<string>();
  const next: Record<string, DeckEntry> = {};
  for (const [id, entry] of Object.entries(deck.entries)) {
    if (isUnlimitedQuantity(entry.card)) {
      next[id] = entry;
      continue;
    }
    if (seen.has(entry.card.name)) continue;
    seen.add(entry.card.name);
    next[id] = entry;
  }
  // If commander/partner refs pointed at a dropped entry, repoint them
  // at whichever entry of that name survived.
  let commanderId = deck.commanderId;
  let partnerId = deck.partnerId;
  if (commanderId && !next[commanderId]) {
    const cmd = Object.values(next).find((e) => e.cardId === commanderId);
    commanderId = cmd?.cardId;
  }
  if (partnerId && !next[partnerId]) {
    const p = Object.values(next).find((e) => e.cardId === partnerId);
    partnerId = p?.cardId;
  }
  return { ...deck, entries: next, commanderId, partnerId };
}
