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

interface DeckStore {
  profile: Profile;
  decks: Record<string, Deck>;
  activeDeckId: string | null;

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
    }),
    {
      name: "mtg-commander-deck-builder",
      storage: createJSONStorage(() => localStorage),
      version: 3,
      // swipedIds is intentionally session-only (not persisted) — it's a
      // "don't show me this card twice this session" filter, not user data.
      partialize: (state) => ({
        profile: state.profile,
        decks: state.decks,
        activeDeckId: state.activeDeckId,
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
      },
    },
  ),
);

export function activeDeck(s: DeckStore): Deck | null {
  return s.activeDeckId ? (s.decks[s.activeDeckId] ?? null) : null;
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
