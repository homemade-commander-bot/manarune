"use client";

import { useState } from "react";
import type { Deck } from "@/lib/types";
import { estimateBracket } from "@/lib/brackets";

const BRACKET_COLORS = {
  1: "from-emerald-600 to-emerald-400 text-emerald-50",
  2: "from-sky-600 to-sky-400 text-sky-50",
  3: "from-amber-600 to-amber-400 text-amber-50",
  4: "from-orange-600 to-red-500 text-orange-50",
  5: "from-fuchsia-700 to-rose-600 text-fuchsia-50",
} as const;

const SIGNAL_COLORS = {
  info: "border-zinc-700/40 text-zinc-300 bg-bg-raised",
  warn: "border-amber-700/40 text-amber-300 bg-amber-900/10",
  danger: "border-red-700/40 text-red-300 bg-red-900/10",
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
          className="text-[10px] text-zinc-400 underline hover:text-amber-400"
          title="Wizards of the Coast — Commander Brackets"
        >
          official
        </a>
      </div>

      <div className={`relative overflow-hidden rounded-lg p-4 bg-gradient-to-br ${BRACKET_COLORS[est.bracket]}`}>
        <div className="text-[10px] uppercase tracking-widest opacity-80">Bracket {est.bracket}</div>
        <div className="font-display text-2xl drop-shadow">{est.label}</div>
        <div className="text-[11px] mt-1 opacity-95 leading-snug">{est.description}</div>
        <div className="mt-2 flex items-center gap-1 text-[10px] opacity-90">
          {[1, 2, 3, 4, 5].map((b) => (
            <span
              key={b}
              className={`flex-1 h-1.5 rounded ${b <= est.bracket ? "bg-white/90" : "bg-white/20"}`}
              title={`Bracket ${b}`}
            />
          ))}
        </div>
        <div className="text-[10px] mt-1 opacity-80">Confidence: {est.confidence}</div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
        <Stat label="Game Changers" value={est.gameChangers.length} hot={est.gameChangers.length > 3} />
        <Stat label="Tutors" value={est.tutors.length} hot={est.tutors.length > 4} />
        <Stat label="Fast Mana" value={est.fastMana.length} hot={est.fastMana.length > 2} />
        <Stat label="MLD" value={est.mld.length} hot={est.mld.length > 0} />
      </div>

      {est.signals.length > 0 && (
        <ul className="space-y-1">
          {est.signals.map((s, i) => (
            <li key={i} className={`border rounded px-2 py-1 text-[11px] ${SIGNAL_COLORS[s.level]}`}>
              <div>{s.message}</div>
              {expanded && s.cards && s.cards.length > 0 && (
                <div className="mt-1 text-[10px] opacity-80">{s.cards.join(", ")}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {est.comboPieces.length > 0 && expanded && (
        <div className="text-[10px] text-zinc-400">
          <div className="font-semibold text-red-300 mb-0.5">Suspected combo lines:</div>
          <ul className="space-y-0.5">
            {est.comboPieces.map((c) => (
              <li key={c.name}>
                <span className="text-red-300">{c.name}</span> + {c.matchedPartners.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[10px] text-zinc-400 hover:text-amber-400 underline"
      >
        {expanded ? "Hide details" : "Show details"}
      </button>

      <div className="text-[9px] text-zinc-500 leading-tight">
        Heuristic estimate. The Game Changers list is curated and may lag the official list — verify at the link above.
      </div>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: number; hot?: boolean }) {
  return (
    <div className={`rounded p-1.5 border ${hot ? "border-red-700/40 bg-red-900/15" : "border-bg-border bg-bg-raised"}`}>
      <div className={`font-mono text-base ${hot ? "text-red-300" : "text-zinc-100"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-400 leading-tight">{label}</div>
    </div>
  );
}
