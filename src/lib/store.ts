"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Card, Deck, DeckEntry } from "./types";
import { categorize } from "./analytics";

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
          return {
            decks: {
              ...s.decks,
              [deckId]: { ...deck, commanderId: card.id, entries, updatedAt: Date.now() },
            },
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
    }),
    {
      name: "mtg-commander-deck-builder",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (state: unknown, fromVersion: number) => {
        const s = (state ?? {}) as Partial<DeckStore>;
        if (fromVersion < 2 && !s.profile) {
          return { ...s, profile: defaultProfile() } as DeckStore;
        }
        return s as DeckStore;
      },
    },
  ),
);

export function activeDeck(s: DeckStore): Deck | null {
  return s.activeDeckId ? (s.decks[s.activeDeckId] ?? null) : null;
}
