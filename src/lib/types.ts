// Scryfall card type — see https://scryfall.com/docs/api/cards
export type Color = "W" | "U" | "B" | "R" | "G";

export type Legality = "legal" | "not_legal" | "restricted" | "banned";

export interface ImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface CardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: ImageUris;
  colors?: Color[];
}

export interface Prices {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  tix?: string | null;
}

export interface PurchaseUris {
  tcgplayer?: string;
  cardmarket?: string;
  cardhoarder?: string;
}

export interface RelatedUris {
  edhrec?: string;
  gatherer?: string;
  tcgplayer_infinite_articles?: string;
  tcgplayer_infinite_decks?: string;
}

export interface Card {
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  released_at: string;
  layout: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: Color[];
  color_identity: Color[];
  keywords: string[];
  produced_mana?: string[];
  set: string;
  set_name: string;
  collector_number: string;
  rarity: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
  image_uris?: ImageUris;
  card_faces?: CardFace[];
  prices: Prices;
  purchase_uris?: PurchaseUris;
  related_uris?: RelatedUris;
  legalities: Record<string, Legality>;
  edhrec_rank?: number;
  scryfall_uri: string;
  rulings_uri: string;
  reserved?: boolean;
}

export interface ScryfallList<T> {
  object: "list";
  total_cards?: number;
  has_more: boolean;
  next_page?: string;
  data: T[];
  warnings?: string[];
}

export interface Ruling {
  object: "ruling";
  oracle_id: string;
  source: string;
  published_at: string;
  comment: string;
}

export interface DeckEntry {
  cardId: string;
  card: Card;
  quantity: number; // Always 1 for non-basic-land in commander
  category?: DeckCategory;
}

export type DeckCategory =
  | "Commander"
  | "Creature"
  | "Planeswalker"
  | "Instant"
  | "Sorcery"
  | "Artifact"
  | "Enchantment"
  | "Battle"
  | "Land";

export interface Deck {
  id: string;
  name: string;
  commanderId?: string;
  partnerId?: string;
  entries: Record<string, DeckEntry>;
  createdAt: number;
  updatedAt: number;
  themes: string[];
  notes?: string;
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  rule: string;
  message: string;
  cardId?: string;
}
