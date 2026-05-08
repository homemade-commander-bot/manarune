"use client";

import Link from "next/link";
import type { Deck } from "@/lib/types";
import { frontImage } from "@/lib/scryfall";
import { commanderColorIdentity, colorIdentityString } from "@/lib/commander-rules";
import { ColorIdentityPips, ManaCost } from "./ManaCost";
import { totalCards } from "@/lib/analytics";

export function CommanderBanner({ deck, onInspectCommander }: { deck: Deck; onInspectCommander: () => void }) {
  const cmd = deck.commanderId ? deck.entries[deck.commanderId]?.card : undefined;
  const partner = deck.partnerId ? deck.entries[deck.partnerId]?.card : undefined;
  const ci = commanderColorIdentity(cmd, partner);
  const ciStr = colorIdentityString(ci);
  const total = totalCards(deck);
  const art = cmd ? frontImage(cmd, "art_crop") : undefined;

  if (!cmd) {
    return (
      <div className="commander-banner aspect-[12/2] bg-bg-raised flex items-center justify-center">
        <Link href="/commanders" className="btn btn-primary">Choose your commander</Link>
      </div>
    );
  }

  return (
    <div className="commander-banner relative">
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt={cmd.name} className="w-full h-32 sm:h-40 object-cover" />
      )}
      <div className="absolute inset-0 z-10 flex items-end justify-between p-3 sm:p-4 gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-zinc-300/70">Commander</div>
          <button
            onClick={onInspectCommander}
            className="font-display text-2xl sm:text-3xl text-white drop-shadow hover:text-amber-300 text-left truncate"
          >
            {cmd.name}{partner ? ` + ${partner.name}` : ""}
          </button>
          <div className="flex items-center gap-2 mt-1">
            <ColorIdentityPips colors={Array.from(ci)} />
            <span className="text-zinc-300 text-xs">{ciStr || "Colorless"}</span>
            <span className="text-zinc-500">·</span>
            <ManaCost cost={cmd.mana_cost} />
            <span className="text-zinc-500">·</span>
            <span className={`text-xs ${total === 100 ? "text-emerald-400" : "text-zinc-300"}`}>
              {total}/100
            </span>
          </div>
        </div>
        <Link
          href={`/commanders?replace=${encodeURIComponent(deck.id)}`}
          className="btn btn-ghost text-xs"
          title="Replace this deck's commander (keeps the rest of your deck intact)"
        >
          Change
        </Link>
      </div>
    </div>
  );
}
