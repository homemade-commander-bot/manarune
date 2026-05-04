"use client";

import { useEffect, useState } from "react";
import type { Card, Ruling } from "@/lib/types";
import { scryfall, frontImage, backImage, safeHttpUrl } from "@/lib/scryfall";
import { ManaCost } from "./ManaCost";
import { useDeckStore } from "@/lib/store";

interface Props {
  card: Card | null;
  deckId?: string;
  onClose: () => void;
}

export function CardDetail({ card, deckId, onClose }: Props) {
  const { addCard, removeCard, setCommander, decks } = useDeckStore();
  const [rulings, setRulings] = useState<Ruling[] | null>(null);
  const [loadingRulings, setLoadingRulings] = useState(false);
  const [showBack, setShowBack] = useState(false);

  const inDeck = !!(card && deckId && decks[deckId]?.entries[card.id]);
  const isCommander = !!(card && deckId && decks[deckId]?.commanderId === card.id);

  useEffect(() => {
    setRulings(null);
    setShowBack(false);
    if (!card) return;
    setLoadingRulings(true);
    scryfall
      .rulingsById(card.id)
      .then((r) => setRulings(r.data))
      .catch(() => setRulings([]))
      .finally(() => setLoadingRulings(false));
  }, [card]);

  if (!card) return null;
  const front = frontImage(card, "large");
  const back = backImage(card, "large");
  const img = showBack ? back : front;

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="panel max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4 p-4">
          <div className="flex-shrink-0 w-72">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={card.name} className="rounded-lg card-shadow w-full" />
            ) : (
              <div className="aspect-[5/7] bg-bg-raised rounded-lg flex items-center justify-center text-zinc-500">{card.name}</div>
            )}
            {back && (
              <button onClick={() => setShowBack((v) => !v)} className="btn btn-ghost mt-2 w-full justify-center">
                Flip
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h2 className="font-display text-2xl flex-1">{card.name}</h2>
              <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <ManaCost cost={card.mana_cost} />
              <span className="text-zinc-400 text-sm">·</span>
              <span className="text-zinc-300 text-sm">{card.type_line}</span>
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {card.set_name} (#{card.collector_number}) · {card.rarity}
            </div>

            {card.oracle_text && (
              <pre className="mt-3 text-sm text-zinc-200 whitespace-pre-wrap font-sans bg-bg-raised rounded p-3 border border-bg-border">
                {card.oracle_text}
              </pre>
            )}
            {card.card_faces && card.card_faces.length > 1 && (
              <div className="mt-2 space-y-2">
                {card.card_faces.map((f, i) => (
                  <div key={i} className="bg-bg-raised border border-bg-border rounded p-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{f.name}</span>
                      <ManaCost cost={f.mana_cost} />
                    </div>
                    <div className="text-xs text-zinc-400">{f.type_line}</div>
                    {f.oracle_text && (
                      <pre className="mt-1 text-xs whitespace-pre-wrap font-sans">{f.oracle_text}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(card.power || card.toughness) && (
              <div className="mt-2 text-sm text-zinc-300">
                P/T: {card.power}/{card.toughness}
              </div>
            )}
            {card.loyalty && (
              <div className="mt-2 text-sm text-zinc-300">Loyalty: {card.loyalty}</div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Info label="Color identity" value={card.color_identity.join("") || "Colorless"} />
              <Info label="Mana value" value={String(card.cmc)} />
              <Info label="Commander legal" value={card.legalities.commander} />
              <Info label="EDHREC rank" value={card.edhrec_rank ? `#${card.edhrec_rank}` : "—"} />
              <Info label="Price (USD)" value={card.prices.usd ? `$${card.prices.usd}` : "—"} />
              <Info label="Released" value={card.released_at} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {deckId && (
                <>
                  {!inDeck ? (
                    <button onClick={() => addCard(deckId, card)} className="btn btn-primary">+ Add to deck</button>
                  ) : (
                    <button onClick={() => removeCard(deckId, card.id)} className="btn btn-danger">Remove</button>
                  )}
                  {!isCommander && card.legalities.commander === "legal" && (
                    <button onClick={() => setCommander(deckId, card)} className="btn btn-ghost">
                      Set as Commander
                    </button>
                  )}
                </>
              )}
              {safeHttpUrl(card.purchase_uris?.tcgplayer) && (
                <a href={safeHttpUrl(card.purchase_uris?.tcgplayer)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Buy on TCGplayer
                </a>
              )}
              {safeHttpUrl(card.purchase_uris?.cardmarket) && (
                <a href={safeHttpUrl(card.purchase_uris?.cardmarket)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Cardmarket
                </a>
              )}
              {safeHttpUrl(card.related_uris?.edhrec) && (
                <a href={safeHttpUrl(card.related_uris?.edhrec)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  EDHREC
                </a>
              )}
              {safeHttpUrl(card.scryfall_uri) && (
                <a href={safeHttpUrl(card.scryfall_uri)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Scryfall
                </a>
              )}
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-amber-400 mb-1">Official rulings</h3>
              {loadingRulings && <div className="text-xs text-zinc-500">Loading…</div>}
              {!loadingRulings && rulings && rulings.length === 0 && (
                <div className="text-xs text-zinc-500">No rulings published.</div>
              )}
              <ul className="space-y-1 text-xs">
                {rulings?.map((r, i) => (
                  <li key={i} className="border-l-2 border-bg-border pl-2 py-1">
                    <span className="text-zinc-500 mr-2">{r.published_at}</span>
                    <span className="text-zinc-200">{r.comment}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-raised border border-bg-border rounded px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-zinc-200">{value}</div>
    </div>
  );
}
