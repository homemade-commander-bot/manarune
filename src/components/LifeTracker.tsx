"use client";

// Commander life tracker. Built for a phone or tablet sitting in the
// middle of a 4-person table — large tap targets, big life numerals,
// commander art as the player-card background, and 4-player rotation
// so the players opposite the device see their cards right-side-up.
//
// Design lifted from the visual language of the major Magic
// companion apps:
//   • Tap the LEFT half of your card to lose 1 life.
//   • Tap the RIGHT half to gain 1 life.
//   • Corner pills for ±5, poison, commander damage, and undo.
//   • Commander art behind the life total, darkened for legibility.
//
// State is in-component (not in the persisted deck store) because
// most games last 30–90 minutes and "new game" should be a fresh
// slate. The setup (player count / starting life / names / chosen
// commanders) does live in sessionStorage so a mid-game page reload
// doesn't reset the table.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { scryfall, frontImage } from "@/lib/scryfall";
import { canBeCommander } from "@/lib/commander-rules";
import type { Card } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

type StartingLife = 20 | 30 | 40;

interface PlayerState {
  id: number;
  name: string;
  life: number;
  poison: number;
  commanderDamage: number[]; // indexed by opponent player id
  history: LifeEvent[];
  commander?: Card; // optional — chosen via quick-picker
}

interface LifeEvent {
  kind: "life" | "poison" | "cmdrDmg";
  delta: number;
  fromOpponent?: number;
}

// Renamed from "commander-forge.life-tracker.v2" in v1.1.0. The
// loader below checks the legacy key as a fallback so a player in
// the middle of a game doesn't lose their setup on reload.
const STORAGE_KEY = "manarune.life-tracker.v2";
const LEGACY_STORAGE_KEY = "commander-forge.life-tracker.v2";

// Fallback color per seat — used only when a commander hasn't been
// chosen. Once a commander is set, the art replaces the gradient.
const SEAT_COLORS = [
  "from-emerald-800 to-emerald-950",
  "from-sky-800 to-sky-950",
  "from-fuchsia-800 to-fuchsia-950",
  "from-violet-800 to-violet-950",
  "from-rose-800 to-rose-950",
  "from-violet-800 to-violet-950",
];

interface PersistedConfig {
  playerCount: number;
  startingLife: StartingLife;
  playerNames: string[];
  // Just the card id per player; we re-fetch on rehydrate. Avoids
  // bloating sessionStorage with full Card objects.
  commanderIds: (string | null)[];
}

function loadConfig(): PersistedConfig | null {
  if (typeof window === "undefined") return null;
  try {
    // Prefer the current key; fall back to the legacy v1.0.x key from
    // when the product was named Commander Forge. If we find a
    // legacy snapshot we copy it forward so subsequent reads are
    // cheap.
    let raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = sessionStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        sessionStorage.setItem(STORAGE_KEY, legacy);
        raw = legacy;
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.playerCount === "number" &&
      typeof parsed?.startingLife === "number" &&
      Array.isArray(parsed?.playerNames)
    ) {
      return {
        playerCount: parsed.playerCount,
        startingLife: parsed.startingLife,
        playerNames: parsed.playerNames,
        commanderIds: Array.isArray(parsed.commanderIds)
          ? parsed.commanderIds
          : Array.from({ length: parsed.playerCount }, () => null),
      };
    }
  } catch {}
  return null;
}

function saveConfig(c: PersistedConfig): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {}
}

function makePlayer(id: number, life: number, name: string): PlayerState {
  return { id, name, life, poison: 0, commanderDamage: [], history: [] };
}

function ensureCmdrSlots(players: PlayerState[]): PlayerState[] {
  return players.map((p) => ({
    ...p,
    commanderDamage: Array.from(
      { length: players.length },
      (_, i) => p.commanderDamage[i] ?? 0,
    ),
  }));
}

export function LifeTracker() {
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [startingLife, setStartingLife] = useState<StartingLife>(40);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [cmdrDmgFor, setCmdrDmgFor] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Restore config on mount.
  useEffect(() => {
    const cfg = loadConfig();
    if (cfg) {
      setPlayerCount(cfg.playerCount);
      setStartingLife(cfg.startingLife as StartingLife);
      const fresh = ensureCmdrSlots(
        Array.from({ length: cfg.playerCount }, (_, i) =>
          makePlayer(i, cfg.startingLife, cfg.playerNames[i] ?? `Player ${i + 1}`),
        ),
      );
      setPlayers(fresh);
      // Refetch commanders by id (best-effort).
      cfg.commanderIds.forEach((id, idx) => {
        if (!id) return;
        scryfall
          .cardById(id)
          .then((c) => {
            setPlayers((cur) =>
              cur.map((p, i) => (i === idx ? { ...p, commander: c } : p)),
            );
          })
          .catch(() => { /* silent */ });
      });
    } else {
      setPlayers(
        ensureCmdrSlots(
          Array.from({ length: 4 }, (_, i) => makePlayer(i, 40, `Player ${i + 1}`)),
        ),
      );
    }
  }, []);

  // Persist setup whenever it changes.
  useEffect(() => {
    if (players.length === 0) return;
    saveConfig({
      playerCount,
      startingLife,
      playerNames: players.map((p) => p.name),
      commanderIds: players.map((p) => p.commander?.id ?? null),
    });
  }, [playerCount, startingLife, players]);

  function adjustLife(idx: number, delta: number) {
    setPlayers((cur) =>
      cur.map((p, i) =>
        i !== idx
          ? p
          : {
              ...p,
              life: p.life + delta,
              history: [...p.history, { kind: "life", delta }],
            },
      ),
    );
  }

  function adjustPoison(idx: number, delta: number) {
    setPlayers((cur) =>
      cur.map((p, i) => {
        if (i !== idx) return p;
        const next = Math.max(0, p.poison + delta);
        const actual = next - p.poison;
        return {
          ...p,
          poison: next,
          history:
            actual !== 0
              ? [...p.history, { kind: "poison", delta: actual }]
              : p.history,
        };
      }),
    );
  }

  function adjustCmdrDmg(idx: number, oppIdx: number, delta: number) {
    setPlayers((cur) =>
      cur.map((p, i) => {
        if (i !== idx) return p;
        const cur = p.commanderDamage[oppIdx] ?? 0;
        const next = Math.max(0, cur + delta);
        const actual = next - cur;
        const dmg = [...p.commanderDamage];
        dmg[oppIdx] = next;
        return {
          ...p,
          commanderDamage: dmg,
          life: p.life - actual,
          history:
            actual !== 0
              ? [...p.history, { kind: "cmdrDmg", delta: actual, fromOpponent: oppIdx }]
              : p.history,
        };
      }),
    );
  }

  function undo(idx: number) {
    setPlayers((cur) =>
      cur.map((p, i) => {
        if (i !== idx || p.history.length === 0) return p;
        const last = p.history[p.history.length - 1];
        const history = p.history.slice(0, -1);
        if (last.kind === "life") return { ...p, life: p.life - last.delta, history };
        if (last.kind === "poison")
          return { ...p, poison: Math.max(0, p.poison - last.delta), history };
        if (last.kind === "cmdrDmg" && last.fromOpponent !== undefined) {
          const dmg = [...p.commanderDamage];
          dmg[last.fromOpponent] = Math.max(0, (dmg[last.fromOpponent] ?? 0) - last.delta);
          return { ...p, commanderDamage: dmg, life: p.life + last.delta, history };
        }
        return p;
      }),
    );
  }

  function rename(idx: number, name: string) {
    setPlayers((cur) =>
      cur.map((p, i) => (i === idx ? { ...p, name: name.slice(0, 24) } : p)),
    );
  }

  function setCommanderForPlayer(idx: number, card: Card | null) {
    setPlayers((cur) =>
      cur.map((p, i) => (i === idx ? { ...p, commander: card ?? undefined } : p)),
    );
    setPickerFor(null);
  }

  function applyPlayerCount(n: number) {
    setPlayerCount(n);
    setPlayers((cur) => {
      const sized = Array.from({ length: n }, (_, i) => {
        if (cur[i]) return cur[i];
        return makePlayer(i, startingLife, `Player ${i + 1}`);
      });
      return ensureCmdrSlots(sized);
    });
  }

  function applyStartingLife(life: StartingLife) {
    setStartingLife(life);
    setPlayers((cur) =>
      cur.map((p) => ({
        ...p,
        life,
        poison: 0,
        commanderDamage: p.commanderDamage.map(() => 0),
        history: [],
      })),
    );
  }

  function resetGame() {
    setPlayers((cur) =>
      cur.map((p) => ({
        ...p,
        life: startingLife,
        poison: 0,
        commanderDamage: p.commanderDamage.map(() => 0),
        history: [],
      })),
    );
    setConfirmReset(false);
  }

  // Layout strategy. ForceLandscape guarantees we're in a landscape
  // coordinate system, so the grid can lay out cards with explicit
  // rows + columns that fill the viewport. Player counts:
  //   2 → 1×2 stacked (one card facing each side of the table)
  //   3 → 3×1 in a row
  //   4 → 2×2; top row rotated 180° for opposite players
  //   5/6 → 3×2 grid
  // Rotation is opt-in per layout so the players opposite the device
  // read their cards right-side-up.
  const layout = useMemo(() => {
    if (playerCount === 2)
      return { cls: "grid-cols-1 grid-rows-2", rotateIndices: [0] };
    if (playerCount === 3)
      return { cls: "grid-cols-3 grid-rows-1", rotateIndices: [] as number[] };
    if (playerCount === 4)
      return { cls: "grid-cols-2 grid-rows-2", rotateIndices: [0, 1] };
    if (playerCount === 5)
      return { cls: "grid-cols-3 grid-rows-2", rotateIndices: [0, 1] };
    return { cls: "grid-cols-3 grid-rows-2", rotateIndices: [0, 1, 2] };
  }, [playerCount]);

  return (
    <div className="h-full w-full flex flex-col px-1.5 sm:px-2 pt-1.5 sm:pt-2 pb-1.5 sm:pb-2 gap-1.5 sm:gap-2">
      {/* Compact setup bar — one line, ~36px tall */}
      <section className="panel px-2 py-1.5 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm flex-shrink-0">
        <Link
          href="/"
          className="text-zinc-400 hover:text-violet-300 text-base leading-none"
          title="Back to deck library"
          aria-label="Back to deck library"
        >
          ←
        </Link>
        <h1 className="font-display text-base sm:text-lg text-violet-300">Life</h1>
        <label className="flex items-center gap-1">
          <span className="text-zinc-400 hidden sm:inline">Players</span>
          <span className="text-zinc-400 sm:hidden">P</span>
          <select
            value={playerCount}
            onChange={(e) => applyPlayerCount(Number(e.target.value))}
            className="bg-bg-raised border border-bg-border rounded px-1.5 py-0.5"
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-zinc-400 hidden sm:inline">Start</span>
          <select
            value={startingLife}
            onChange={(e) => applyStartingLife(Number(e.target.value) as StartingLife)}
            className="bg-bg-raised border border-bg-border rounded px-1.5 py-0.5"
          >
            <option value={40}>40</option>
            <option value={30}>30</option>
            <option value={20}>20</option>
          </select>
        </label>
        <button
          onClick={() => setConfirmReset(true)}
          className="btn btn-ghost text-xs ml-auto px-2 py-0.5"
          title="Reset all players to starting life"
        >
          ↺ <span className="hidden sm:inline">New game</span><span className="sm:hidden">New</span>
        </button>
      </section>

      {/* Player grid fills remaining height. Each cell stretches to
          fill its grid track via the PlayerCard's h-full w-full. */}
      <div className={`flex-1 grid ${layout.cls} gap-1.5 sm:gap-2 min-h-0`}>
        {players.map((p, i) => {
          const rotated = layout.rotateIndices.includes(i);
          return (
            <div
              key={p.id}
              className={`min-h-0 min-w-0 ${rotated ? "rotate-180" : ""}`}
            >
              <PlayerCard
                player={p}
                index={i}
                startingLife={startingLife}
                color={SEAT_COLORS[i % SEAT_COLORS.length]}
                onLife={(d) => adjustLife(i, d)}
                onPoison={(d) => adjustPoison(i, d)}
                onRename={(name) => rename(i, name)}
                onUndo={() => undo(i)}
                onOpenCmdrDmg={() => setCmdrDmgFor(i)}
                onOpenPicker={() => setPickerFor(i)}
              />
            </div>
          );
        })}
      </div>

      {pickerFor !== null && (
        <CommanderQuickPicker
          currentName={players[pickerFor]?.commander?.name}
          onPick={(card) => setCommanderForPlayer(pickerFor, card)}
          onClear={() => setCommanderForPlayer(pickerFor, null)}
          onClose={() => setPickerFor(null)}
        />
      )}

      {cmdrDmgFor !== null && (
        <CommanderDamageModal
          target={players[cmdrDmgFor]}
          targetIndex={cmdrDmgFor}
          opponents={players}
          onAdjust={(opponentIdx, delta) => adjustCmdrDmg(cmdrDmgFor, opponentIdx, delta)}
          onClose={() => setCmdrDmgFor(null)}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Start a new game?"
        message="Every player resets to starting life. Commanders and player names are kept."
        confirmLabel="Reset"
        cancelLabel="Keep playing"
        onConfirm={resetGame}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function PlayerCard({
  player,
  index,
  startingLife,
  color,
  onLife,
  onPoison,
  onRename,
  onUndo,
  onOpenCmdrDmg,
  onOpenPicker,
}: {
  player: PlayerState;
  index: number;
  startingLife: number;
  color: string;
  onLife: (delta: number) => void;
  onPoison: (delta: number) => void;
  onRename: (name: string) => void;
  onUndo: () => void;
  onOpenCmdrDmg: () => void;
  onOpenPicker: () => void;
}) {
  const dead = player.life <= 0;
  const poisoned = player.poison >= 10;
  const maxCmdrDmg = Math.max(0, ...player.commanderDamage);
  const cmdrKilled = maxCmdrDmg >= 21;
  const eliminated = dead || poisoned || cmdrKilled;

  const art = player.commander ? frontImage(player.commander, "art_crop") : undefined;
  const lifeColor =
    player.life > startingLife / 2
      ? "text-white"
      : player.life > Math.floor(startingLife / 4)
        ? "text-yellow-200"
        : "text-red-300";

  return (
    <article
      className={`relative w-full h-full rounded-xl overflow-hidden card-shadow border-2 ${
        eliminated ? "border-red-700/70 opacity-70" : "border-white/10"
      }`}
      // container-type lets the inner life numeral scale relative to
      // this card's width via cqi units — bigger when 2-up, smaller
      // when 6-up, all from one font-size rule.
      style={{ containerType: "inline-size" }}
    >
      {/* Background: commander art or seat-color fallback */}
      {art ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
          {/* Darkening overlay for text legibility */}
          <div className="absolute inset-0 bg-black/55" />
        </>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${color}`} />
      )}

      {eliminated && (
        <div className="absolute top-1.5 right-1.5 z-30 text-[10px] uppercase tracking-wider font-bold bg-red-700 text-white px-2 py-0.5 rounded">
          {dead ? "0 life" : cmdrKilled ? "cmdr dmg" : "poison"}
        </div>
      )}

      {/* Tap zones — left half = −1, right half = +1. Avoid the top
          bar and the bottom button row so those controls remain
          tappable. z-10 sits ABOVE the life numeral (which uses
          pointer-events-none) but BELOW the top/bottom UI. */}
      {/* −1 / +1 tap zones. Glyphs are ALWAYS visible at moderate
          opacity (touch devices have no hover), with a brighter
          active-state pulse so users get visual confirmation of the
          tap. Aria-labels are explicit because the visible character
          is a math minus, not a hyphen — screen readers should
          announce "decrease life" rather than the punctuation. */}
      <button
        onClick={() => onLife(-1)}
        aria-label="Decrease life by 1"
        className="absolute left-0 top-8 bottom-9 z-10 w-1/2 group"
      >
        <span className="absolute inset-y-0 left-3 sm:left-4 flex items-center text-4xl sm:text-5xl text-white/35 group-hover:text-white/60 group-active:text-white/95 group-active:scale-125 font-mono font-bold select-none transition drop-shadow-md">
          −
        </span>
      </button>
      <button
        onClick={() => onLife(1)}
        aria-label="Increase life by 1"
        className="absolute right-0 top-8 bottom-9 z-10 w-1/2 group"
      >
        <span className="absolute inset-y-0 right-3 sm:right-4 flex items-center text-4xl sm:text-5xl text-white/35 group-hover:text-white/60 group-active:text-white/95 group-active:scale-125 font-mono font-bold select-none transition drop-shadow-md">
          +
        </span>
      </button>

      {/* Top bar — player name + commander pill. Kept thin so the
          central life numeral has maximum vertical real estate. */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between gap-1 px-1.5 py-1">
        <input
          value={player.name}
          maxLength={24}
          onChange={(e) => onRename(e.target.value)}
          // 16px on focus prevents iOS Safari auto-zoom, which is
          // especially disorienting when the page is also CSS-rotated.
          // Rendered at 11px via inline style + scale-down on the
          // unfocused state? Simpler: use 16px always and let Tailwind
          // text-xs apply only to the placeholder dimension via class.
          // The font-size: 16px keeps the OS happy; the inline width
          // constraint keeps the visible footprint tight.
          style={{ fontSize: "16px" }}
          className="bg-transparent text-white font-medium px-1 py-0.5 rounded border border-transparent hover:border-white/20 focus:border-white/40 focus:bg-black/40 outline-none min-w-0 flex-1"
          aria-label={`Player ${index + 1} name`}
        />
        <button
          onClick={onOpenPicker}
          className="text-[10px] text-white/80 hover:text-violet-300 bg-black/40 hover:bg-black/60 px-1.5 py-0.5 rounded border border-white/10 truncate max-w-[100px] sm:max-w-[140px] flex-shrink-0"
          title="Set or change this player's commander"
        >
          {player.commander ? `⚔ ${player.commander.name.split(",")[0]}` : "+ Commander"}
        </button>
      </div>

      {/* Centered life — non-interactive so the tap zones get the clicks.
          The numeral scales with the smaller of the card's two dimensions
          via clamp(min, viewport-relative, max), so it stays huge on a
          tablet but shrinks gracefully when a 6th player joins the grid. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2">
        <div
          className={`font-mono font-bold leading-none drop-shadow-lg ${lifeColor}`}
          style={{ fontSize: "clamp(2.5rem, 18cqi, 8rem)" }}
        >
          {player.life}
        </div>
        <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-white/60 mt-1">
          life
        </div>
      </div>

      {/* Bottom bar — secondary counters and undo. Same vertical
          budget as the top bar to keep the layout symmetric. */}
      <div className="absolute bottom-0 inset-x-0 z-20 flex items-center justify-between gap-1 px-1.5 py-1">
        <CornerButton onClick={() => onLife(-5)} aria-label="−5 life">−5</CornerButton>
        <CornerButton
          onClick={() => onPoison(1)}
          onContextMenu={(e) => {
            e.preventDefault();
            onPoison(-1);
          }}
          aria-label="Poison counter"
          highlighted={player.poison > 0}
        >
          <span>☠</span>
          <span className="font-mono ml-0.5">{player.poison}</span>
        </CornerButton>
        <CornerButton
          onClick={onOpenCmdrDmg}
          aria-label="Commander damage"
          highlighted={maxCmdrDmg > 0}
        >
          <span>⚔</span>
          <span className="font-mono ml-0.5">{maxCmdrDmg}</span>
        </CornerButton>
        <CornerButton
          onClick={onUndo}
          disabled={player.history.length === 0}
          aria-label="Undo"
        >
          ↺
        </CornerButton>
        <CornerButton onClick={() => onLife(5)} aria-label="+5 life">+5</CornerButton>
      </div>
    </article>
  );
}

function CornerButton({
  children,
  highlighted,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { highlighted?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled}
      // Bumped from px-1.5/py-0.5/28px min to px-3/py-2/44px min so
      // they hit Apple's accessibility tap-target guideline (44px)
      // and are visibly distinct against the commander art behind
      // them. The text/glyph also goes from text-[11px] to text-sm
      // for at-a-glance readability across the table.
      className={`flex items-center justify-center gap-0.5 px-3 py-2 rounded-md text-sm font-semibold text-white transition select-none min-w-[44px] min-h-[36px] ring-1 ring-white/10 ${
        highlighted
          ? "bg-violet-700/80 hover:bg-violet-600/90"
          : "bg-black/55 hover:bg-black/70"
      } ${disabled ? "opacity-30 cursor-not-allowed" : "active:scale-95"}`}
    >
      {children}
    </button>
  );
}

// Quick commander picker — a small modal with Scryfall autocomplete.
// Single-purpose (used only by the life tracker), kept inline so we
// don't pull the full /commanders page weight into a phone view.
function CommanderQuickPicker({
  currentName,
  onPick,
  onClear,
  onClose,
}: {
  currentName?: string;
  onPick: (card: Card) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      try {
        const names = await scryfall.autocomplete(q.trim());
        setSuggestions(names.slice(0, 10));
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [q]);

  async function pickName(name: string) {
    setLoading(true);
    setError(null);
    try {
      const card = await scryfall.cardByName(name);
      if (!canBeCommander(card)) {
        setError(`"${card.name}" isn't a legal commander.`);
        setLoading(false);
        return;
      }
      onPick(card);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      setLoading(false);
    }
  }

  // Portal the modal to document.body so it escapes the ForceLandscape
  // 90° rotation. The soft keyboard on mobile is system-driven and
  // appears in physical/unrotated coordinates, so the input must
  // live in unrotated coordinates too — otherwise the focused input
  // ends up off-screen or partially obscured by the keyboard.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 pt-20 sm:pt-4 animate-[fadeIn_120ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md p-4 sm:p-5 space-y-3 animate-[popIn_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg text-violet-300">Set commander</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              The art appears behind this player&apos;s life total. Only used here — doesn&apos;t touch your decks.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search commanders…"
          className="w-full bg-bg-raised border border-bg-border rounded px-3 py-2 text-base outline-none focus:ring-2 focus:ring-violet-500/60"
        />

        {error && <div className="text-xs text-red-400">{error}</div>}

        {suggestions.length > 0 && (
          <ul className="max-h-60 overflow-y-auto border border-bg-border rounded divide-y divide-bg-border">
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  onClick={() => pickName(name)}
                  disabled={loading}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-bg-raised disabled:opacity-50 truncate"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {currentName && (
          <button
            onClick={onClear}
            className="text-xs text-zinc-400 hover:text-red-400 underline w-full text-center"
          >
            Clear commander ({currentName})
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function CommanderDamageModal({
  target,
  targetIndex,
  opponents,
  onAdjust,
  onClose,
}: {
  target: PlayerState;
  targetIndex: number;
  opponents: PlayerState[];
  onAdjust: (opponentIdx: number, delta: number) => void;
  onClose: () => void;
}) {
  // Portaled out of the rotated /play viewport for the same reason
  // as the commander picker — the +/− buttons stay where the user's
  // thumb expects them, in physical-screen coordinates.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-[fadeIn_120ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md p-4 sm:p-5 space-y-3 animate-[popIn_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg text-violet-300">
              Commander damage to {target.name}
            </h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              21 from a single commander = loss (CR 903.14a). Adjusting here also drops the target&apos;s life.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <ul className="space-y-1.5">
          {opponents.map((opp, i) => {
            if (i === targetIndex) return null;
            const dmg = target.commanderDamage[i] ?? 0;
            const lethal = dmg >= 21;
            return (
              <li
                key={opp.id}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                  lethal ? "border-red-600 bg-red-900/30" : "border-bg-border bg-bg-raised"
                }`}
              >
                <span className="flex-1 text-sm text-zinc-200 truncate">
                  {opp.commander ? opp.commander.name : `${opp.name}'s commander`}
                </span>
                <button
                  onClick={() => onAdjust(i, -1)}
                  disabled={dmg === 0}
                  className="w-8 h-8 rounded bg-black/40 hover:bg-black/60 disabled:opacity-30 text-white font-mono"
                >
                  −
                </button>
                <span className={`font-mono text-lg w-8 text-center ${lethal ? "text-red-200" : "text-zinc-100"}`}>
                  {dmg}
                </span>
                <button
                  onClick={() => onAdjust(i, 1)}
                  className="w-8 h-8 rounded bg-violet-700 hover:bg-violet-600 text-white font-mono"
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
