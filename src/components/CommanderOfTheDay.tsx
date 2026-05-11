"use client";

// Commander of the Day — picks one card from a curated rotation list,
// seeded by the calendar date so the same commander shows all day
// across all visitors. Hero treatment with art_crop background and a
// big "Build with this commander" CTA.
//
// The curated list emphasizes a mix of:
//   • iconic / format-defining commanders (Atraxa, Edgar Markov, etc.)
//   • interesting recent releases (commanders likely to be on people's
//     radar but not necessarily their first instinct)
//   • mechanically varied (one for every play pattern: tokens, voltron,
//     spellslinger, aristocrats, +1/+1 counters, group hug, stax, etc.)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { scryfall, frontImage } from "@/lib/scryfall";
import { useDeckStore } from "@/lib/store";
import { canBeCommander } from "@/lib/commander-rules";
import type { Card } from "@/lib/types";
import { ColorIdentityPips, ManaCost } from "./ManaCost";

// Roster: ~60 commanders. Date-seeded pick → roughly every 60 days the
// rotation repeats. Names match Scryfall exactly so the lookup hits.
const ROSTER: readonly string[] = [
  // Mono-color icons
  "Krenko, Mob Boss",
  "Ghave, Guru of Spores",
  "Yawgmoth, Thran Physician",
  "Talrand, Sky Summoner",
  "Avacyn, Angel of Hope",
  "Liesa, Shroud of Dusk",
  "Lord Windgrace",
  "Tovolar, Dire Overlord",
  "Heliod, Sun-Crowned",
  "Urza, Lord High Artificer",
  // Two-color mainstays
  "Krark, the Thumbless",
  "Sakashima of a Thousand Faces",
  "The Ur-Dragon",
  "Tergrid, God of Fright",
  "Edgar Markov",
  "Korvold, Fae-Cursed King",
  "Yuriko, the Tiger's Shadow",
  "Light-Paws, Emperor's Voice",
  "Anje Falkenrath",
  "Niv-Mizzet, Parun",
  "Kraum, Ludevic's Opus",
  "Tymna the Weaver",
  // Three-color (shards & wedges)
  "Atraxa, Praetors' Voice",
  "Atraxa, Grand Unifier",
  "Marchesa, the Black Rose",
  "Riku of Two Reflections",
  "Kambal, Consul of Allocation",
  "Kambal, Profiteering Mayor",
  "Roon of the Hidden Realm",
  "Anafenza, the Foremost",
  // Four & five color
  "Kenrith, the Returned King",
  "Najeela, the Blade-Blossom",
  "Sisay, Weatherlight Captain",
  "Jegantha, the Wellspring",
  // Modern faves & flavour
  "Voja, Jaws of the Conclave",
  "Wilhelt, the Rotcleaver",
  "Lord Skitter, Sewer King",
  "Slimefoot and Squee",
  "Miirym, Sentinel Wyrm",
  "Talion, the Kindly Lord",
  "Henzie \"Toolbox\" Torre",
  "Captain Sisay",
  "Selvala, Heart of the Wilds",
  "Animar, Soul of Elements",
  "Karador, Ghost Chieftain",
  "Meren of Clan Nel Toth",
  "Prossh, Skyraider of Kher",
  "Zur the Enchanter",
  "Oloro, Ageless Ascetic",
  // Newer
  "Satya, Aetroflux Genius",
  "Aragorn, the Uniter",
  "Galadriel of Lothlórien",
  "Sauron, the Dark Lord",
  "Doctor Who",
  "Greasefang, Okiba Boss",
  "Magda, Brazen Outlaw",
  "Bria, Riptide Rogue",
] as const;

// Stable hash from a date string (YYYY-MM-DD) to a roster index.
// Same calendar day → same index for every visitor.
function pickIndex(date: Date): number {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const key = `${yyyy}-${mm}-${dd}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % ROSTER.length;
}

export function CommanderOfTheDay() {
  const router = useRouter();
  const { createDeck, setActiveDeck, setCommander } = useDeckStore();
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const name = ROSTER[pickIndex(new Date())];
    scryfall
      .cardByName(name)
      .then((c) => {
        if (cancelled) return;
        if (canBeCommander(c)) setCard(c);
        else setError(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function pick() {
    if (!card) return;
    const id = createDeck(card.name);
    setActiveDeck(id);
    setCommander(id, card);
    router.push("/build");
  }

  if (error) {
    return null; // silent hide on failure — landing still has other content
  }

  if (!card) {
    return (
      <section className="panel overflow-hidden">
        <div className="aspect-[12/5] sm:aspect-[16/5] bg-bg-raised animate-pulse" />
      </section>
    );
  }

  const art = frontImage(card, "art_crop");
  const fullCard = frontImage(card, "normal");

  return (
    <section className="panel overflow-hidden relative">
      {/* Hero background — art_crop is widescreen banner-friendly */}
      <div className="relative aspect-[16/6] sm:aspect-[16/5] min-h-[200px]">
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt={card.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/70 to-bg-base/20" />
        <div className="absolute inset-0 flex items-end p-4 sm:p-6 gap-3 sm:gap-4">
          {/* Card thumbnail on the right (hidden on tiny phones) */}
          {fullCard && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fullCard}
              alt=""
              aria-hidden
              className="hidden sm:block absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 w-[120px] sm:w-[160px] rounded-lg card-shadow ring-1 ring-white/20"
            />
          )}
          <div className="min-w-0 max-w-2xl sm:pr-44">
            <div className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-amber-300/90 font-semibold">
              Commander of the day
            </div>
            <h2 className="font-display text-2xl sm:text-4xl text-white drop-shadow mt-1 truncate">
              {card.name}
            </h2>
            <div className="flex items-center gap-2 flex-wrap mt-2 text-xs sm:text-sm text-zinc-200">
              <ColorIdentityPips colors={card.color_identity} />
              <span className="text-zinc-400">·</span>
              <ManaCost cost={card.mana_cost} />
              <span className="text-zinc-400 truncate">{card.type_line}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={pick}
                className="btn btn-primary text-sm sm:text-base"
              >
                Build with {card.name.split(",")[0]}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
