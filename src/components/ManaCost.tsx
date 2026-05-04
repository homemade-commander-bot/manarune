"use client";

import React from "react";

// Render Scryfall mana cost strings like "{2}{U}{B}" as colored pip badges.
export function ManaCost({ cost, className = "" }: { cost?: string; className?: string }) {
  if (!cost) return null;
  const parts = cost.match(/\{[^}]+\}/g) ?? [];
  return (
    <span className={`whitespace-nowrap ${className}`}>
      {parts.map((p, i) => {
        const sym = p.slice(1, -1);
        const css = /^[WUBRGC]$/.test(sym) ? `mana-${sym}` : /^\d+$/.test(sym) ? "mana-N" : "mana-X";
        return (
          <span key={i} className={`mana-symbol ${css}`} title={p}>
            {sym}
          </span>
        );
      })}
    </span>
  );
}

export function ColorIdentityPips({ colors }: { colors: string[] }) {
  if (!colors || colors.length === 0) {
    return <span className="mana-symbol mana-C" title="Colorless">C</span>;
  }
  return (
    <span className="whitespace-nowrap">
      {colors.map((c) => (
        <span key={c} className={`mana-symbol mana-${c}`} title={c}>
          {c}
        </span>
      ))}
    </span>
  );
}
