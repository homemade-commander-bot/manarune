"use client";

import { useState } from "react";
import type { Deck } from "@/lib/types";
import { estimateBracket } from "@/lib/brackets";

const BRACKET_COLORS = {
  1: "from-emerald-700 via-emerald-600 to-emerald-500 text-emerald-50",
  2: "from-sky-700 via-sky-600 to-sky-500 text-sky-50",
  3: "from-amber-700 via-amber-600 to-amber-500 text-amber-50",
  4: "from-orange-700 via-orange-600 to-red-600 text-orange-50",
  5: "from-fuchsia-800 via-rose-700 to-rose-600 text-fuchsia-50",
} as const;

const SIGNAL_STYLES = {
  info: { border: "border-zinc-700/50", text: "text-zinc-300", bg: "bg-bg-raised", icon: "·" },
  warn: { border: "border-amber-600/40", text: "text-amber-200", bg: "bg-amber-900/15", icon: "!" },
  danger: { border: "border-red-600/40", text: "text-red-200", bg: "bg-red-900/20", icon: "✕" },
} as const;

const CONFIDENCE_STYLES = {
  low: "bg-white/15 text-white/80",
  medium: "bg-white/20 text-white/90",
  high: "bg-white/30 text-white",
} as const;

export function BracketEstimator({ deck }: { deck: Deck }) {
  const est = estimateBracket(deck);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="panel p-3 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base text-amber-400">Bracket Estimate</h3>
        <a
          href="https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-zinc-400 underline-offset-2 hover:underline hover:text-amber-400"
          title="Wizards of the Coast — Commander Brackets"
        >
          official ↗
        </a>
      </div>

      <div className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${BRACKET_COLORS[est.bracket]} shadow-md`}>
        {/* Decorative big number */}
        <div
          aria-hidden
          className="absolute -right-2 -top-3 font-display text-[6rem] leading-none opacity-15 select-none pointer-events-none"
        >
          {est.bracket}
        </div>

        <div className="relative p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">Bracket {est.bracket} of 5</div>
            <span
              className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${CONFIDENCE_STYLES[est.confidence]}`}
              title="How confident the estimator is in this bracket placement"
            >
              {est.confidence} confidence
            </span>
          </div>

          <div className="font-display text-2xl drop-shadow-sm leading-tight">{est.label}</div>
          <div className="text-[11px] mt-1.5 opacity-90 leading-snug">{est.description}</div>

          <div className="mt-3 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((b) => (
              <span
                key={b}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  b < est.bracket
                    ? "bg-white/80"
                    : b === est.bracket
                      ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                      : "bg-white/15"
                }`}
                title={`Bracket ${b}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Game Changers" value={est.gameChangers.length} hot={est.gameChangers.length > 3} />
        <Stat label="Tutors" value={est.tutors.length} hot={est.tutors.length > 4} />
        <Stat label="Fast Mana" value={est.fastMana.length} hot={est.fastMana.length > 2} />
        <Stat label="MLD" value={est.mld.length} hot={est.mld.length > 0} />
      </div>

      {est.signals.length > 0 && (
        <ul className="space-y-1.5">
          {est.signals.map((s, i) => {
            const style = SIGNAL_STYLES[s.level];
            return (
              <li
                key={i}
                className={`border rounded-md px-2.5 py-1.5 text-[11px] flex items-start gap-2 ${style.border} ${style.bg} ${style.text}`}
              >
                <span className="font-mono text-[10px] mt-0.5 opacity-70 select-none flex-none w-3 text-center">
                  {style.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="leading-snug">{s.message}</div>
                  {expanded && s.cards && s.cards.length > 0 && (
                    <div className="mt-1 text-[10px] opacity-75 break-words">{s.cards.join(", ")}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {est.comboPieces.length > 0 && expanded && (
        <div className="rounded-md border border-fuchsia-700/40 bg-fuchsia-900/15 p-2 text-[10px] text-fuchsia-200">
          <div className="font-semibold mb-1">Suspected combo lines:</div>
          <ul className="space-y-0.5">
            {est.comboPieces.map((c) => (
              <li key={c.name}>
                <span className="font-medium text-fuchsia-100">{c.name}</span>
                <span className="text-fuchsia-300/70"> + {c.matchedPartners.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-zinc-400 hover:text-amber-400 inline-flex items-center gap-1"
          aria-expanded={expanded}
        >
          <span>{expanded ? "▾" : "▸"}</span>
          <span>{expanded ? "Hide details" : "Show details"}</span>
        </button>
        <span className="text-[9px] text-zinc-500 italic text-right max-w-[60%] leading-tight">
          Heuristic — verify against the official list ↗
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: number; hot?: boolean }) {
  return (
    <div
      className={`rounded-md border px-2 py-1.5 text-center transition-colors ${
        hot
          ? "border-red-600/40 bg-red-900/20"
          : value > 0
            ? "border-amber-700/30 bg-amber-900/10"
            : "border-bg-border bg-bg-raised"
      }`}
    >
      <div
        className={`font-mono text-lg leading-none ${
          hot ? "text-red-300" : value > 0 ? "text-amber-200" : "text-zinc-200"
        }`}
      >
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-400 mt-1 leading-tight">
        {label}
      </div>
    </div>
  );
}
