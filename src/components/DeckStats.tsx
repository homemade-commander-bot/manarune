"use client";

import { manaCurve, colorPips, landCount, totalCards, deckPriceUsd, averageCmc } from "@/lib/analytics";
import { validateDeck } from "@/lib/commander-rules";
import type { Deck } from "@/lib/types";

export function DeckStats({ deck }: { deck: Deck }) {
  const curve = manaCurve(deck);
  const pips = colorPips(deck);
  const lands = landCount(deck);
  const total = totalCards(deck);
  const price = deckPriceUsd(deck);
  const avg = averageCmc(deck);
  const issues = validateDeck(deck);
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warning");
  const maxCount = Math.max(1, ...curve.map((c) => c.count));

  return (
    <div className="panel p-3 space-y-3 text-sm">
      <h3 className="font-display text-base text-amber-400">Deck Stats</h3>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Cards" value={`${total}/100`} ok={total === 100} />
        <Stat label="Lands" value={String(lands)} ok={lands >= 30 && lands <= 42} />
        <Stat label="Avg MV" value={avg.toFixed(2)} ok={avg <= 4} />
      </div>

      <div>
        <div className="text-xs text-zinc-400 mb-1">Mana curve (non-land)</div>
        <div className="flex items-end gap-1 h-24">
          {curve.map((b) => (
            <div key={b.cmc} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="text-[10px] text-zinc-300">{b.count}</div>
              <div
                className="w-full bg-amber-600/70 rounded-sm"
                style={{ height: `${(b.count / maxCount) * 80}px`, minHeight: b.count > 0 ? "2px" : "0" }}
                title={`MV ${b.cmc === 7 ? "7+" : b.cmc}: ${b.count}`}
              />
              <div className="text-[10px] text-zinc-500">{b.cmc === 7 ? "7+" : b.cmc}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-zinc-400 mb-1">Color pips</div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          {(["W", "U", "B", "R", "G"] as const).map((c) => (
            <span key={c} className="chip">
              <span className={`mana-symbol mana-${c}`}>{c}</span> {pips[c]}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-zinc-400 mb-1">Estimated price (TCGplayer)</div>
        <div className="text-emerald-400 font-mono">${price.toFixed(2)} USD</div>
      </div>

      <div>
        <div className="text-xs text-zinc-400 mb-1">Format legality</div>
        {issues.length === 0 ? (
          <div className="text-emerald-400 text-xs">✓ Tournament-legal Commander deck</div>
        ) : (
          <ul className="space-y-1">
            {errors.map((i, k) => (
              <li key={`e${k}`} className="text-red-400 text-xs">
                <span className="font-mono mr-1">{i.rule}</span>
                {i.message}
              </li>
            ))}
            {warns.map((i, k) => (
              <li key={`w${k}`} className="text-yellow-400 text-xs">
                <span className="font-mono mr-1">{i.rule}</span>
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="bg-bg-raised border border-bg-border rounded p-2">
      <div className={`font-mono text-lg ${ok ? "text-emerald-400" : "text-zinc-100"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</div>
    </div>
  );
}
