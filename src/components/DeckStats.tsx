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
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="text-xs text-zinc-400">Mana curve <span className="text-zinc-500">(non-land)</span></div>
          {maxCount > 0 && (
            <div className="text-[10px] text-zinc-500">peak {maxCount}</div>
          )}
        </div>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${curve.length}, minmax(0, 1fr))` }}
        >
          {curve.map((b) => {
            const ratio = b.count / maxCount;
            const isPeak = b.count === maxCount && b.count > 0;
            return (
              <div key={b.cmc} className="flex flex-col items-center">
                {/* Count: fixed-height row reserved above the bar so tall
                    bars can't push into it. Empty string keeps spacing. */}
                <div className="h-4 text-[10px] text-zinc-300 leading-4 font-mono">
                  {b.count > 0 ? b.count : ""}
                </div>
                {/* Bar zone: fixed height, bar grows up from bottom. */}
                <div className="h-20 w-full flex items-end relative">
                  <div className="absolute inset-x-0 bottom-0 h-px bg-bg-border" aria-hidden />
                  <div
                    className={`w-full rounded-t-sm transition-all ${
                      isPeak
                        ? "bg-gradient-to-t from-amber-700 to-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.35)]"
                        : "bg-gradient-to-t from-amber-700/90 to-amber-500/80 hover:from-amber-600 hover:to-amber-400"
                    }`}
                    style={{
                      height: b.count === 0 ? "0" : `max(3px, ${ratio * 100}%)`,
                    }}
                    title={`MV ${b.cmc === 7 ? "7+" : b.cmc}: ${b.count} card${b.count === 1 ? "" : "s"}`}
                    aria-label={`Mana value ${b.cmc === 7 ? "7 or more" : b.cmc}: ${b.count} cards`}
                  />
                </div>
                {/* CMC label */}
                <div className="text-[10px] text-zinc-500 mt-1 leading-none font-mono">
                  {b.cmc === 7 ? "7+" : b.cmc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ColorPipBar pips={pips} />

      <div className="flex items-center justify-between gap-2 rounded-md border border-bg-border bg-bg-raised px-3 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">TCGplayer estimate</div>
          <div className="text-emerald-400 font-mono text-sm leading-tight">${price.toFixed(2)} <span className="text-emerald-600/70 text-[10px]">USD</span></div>
        </div>
        <div className="text-2xl opacity-60" aria-hidden>💰</div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Format legality</div>
        {issues.length === 0 ? (
          <div className="rounded-md border border-emerald-700/40 bg-emerald-900/15 px-2.5 py-1.5 text-[11px] text-emerald-300 flex items-center gap-1.5">
            <span aria-hidden>✓</span>
            <span>Tournament-legal Commander deck</span>
          </div>
        ) : (
          <ul className="space-y-1">
            {errors.map((i, k) => (
              <li
                key={`e${k}`}
                className="rounded-md border border-red-700/40 bg-red-900/15 px-2.5 py-1.5 text-[11px] text-red-300 flex items-start gap-1.5"
              >
                <span className="mt-0.5" aria-hidden>✕</span>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-red-400/80 mr-1">{i.rule}</span>
                  <span>{i.message}</span>
                </div>
              </li>
            ))}
            {warns.map((i, k) => (
              <li
                key={`w${k}`}
                className="rounded-md border border-yellow-700/40 bg-yellow-900/15 px-2.5 py-1.5 text-[11px] text-yellow-300 flex items-start gap-1.5"
              >
                <span className="mt-0.5" aria-hidden>!</span>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-yellow-400/80 mr-1">{i.rule}</span>
                  <span>{i.message}</span>
                </div>
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
    <div className="bg-bg-raised border border-bg-border rounded-md px-2 py-1.5">
      <div className={`font-mono text-base leading-none ${ok ? "text-emerald-400" : "text-zinc-100"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-400 mt-1 leading-none">{label}</div>
    </div>
  );
}

// Proportional color-pip bar. Each color becomes a slice sized by its
// share of total pips, mana-symbol coin on top, count below.
function ColorPipBar({ pips }: { pips: Record<"W" | "U" | "B" | "R" | "G", number> }) {
  const order = ["W", "U", "B", "R", "G"] as const;
  const total = order.reduce((s, c) => s + pips[c], 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400">Color pips</div>
        {total > 0 && <div className="text-[10px] text-zinc-500">{total} total</div>}
      </div>
      {total === 0 ? (
        <div className="text-[11px] text-zinc-500 italic">No colored pips yet.</div>
      ) : (
        <>
          {/* proportional stacked bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden bg-bg-border mb-2">
            {order.map((c) => {
              const pct = (pips[c] / total) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={c}
                  className={`mana-bg-${c}`}
                  style={{ width: `${pct}%` }}
                  title={`${c}: ${pips[c]} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
          {/* per-color counts */}
          <div className="grid grid-cols-5 gap-1">
            {order.map((c) => (
              <div
                key={c}
                className={`flex flex-col items-center rounded-md px-1 py-1 border ${
                  pips[c] > 0 ? "border-bg-border bg-bg-raised" : "border-transparent opacity-40"
                }`}
              >
                <span className={`mana-symbol mana-${c}`} style={{ width: "1.4em", height: "1.4em", fontSize: "0.85em" }}>
                  {c}
                </span>
                <span className="text-[10px] font-mono text-zinc-300 mt-1 leading-none">{pips[c]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
