"use client";

// Commander life tracker. Built for table use during an actual game:
// 2–6 players, configurable starting life, per-player commander-damage
// grid (CR 903.14a — 21 from one commander loses the game), poison
// counters (CR 704.5c — 10+ poison loses the game), an undo per player,
// and a reset.
//
// State is kept in-component (not persisted) because most games last
// 30–90 minutes and the user expects "new game = fresh slate". The
// player count and starting life are remembered in sessionStorage so
// a mid-game page reload doesn't wipe the player layout.

import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

type StartingLife = 20 | 30 | 40;

interface PlayerState {
  id: number;
  name: string;
  life: number;
  poison: number;
  // commanderDamage[opponentIndex] = damage from that player's commander
  commanderDamage: number[];
  history: LifeEvent[];
}

interface LifeEvent {
  kind: "life" | "poison" | "cmdrDmg";
  delta: number;
  // For cmdrDmg: index of the opponent dealing the damage
  fromOpponent?: number;
}

const STORAGE_KEY = "commander-forge.life-tracker.v1";
const COLORS = [
  { bg: "from-emerald-700 to-emerald-900", accent: "border-emerald-500" },
  { bg: "from-sky-700 to-sky-900", accent: "border-sky-500" },
  { bg: "from-fuchsia-700 to-fuchsia-900", accent: "border-fuchsia-500" },
  { bg: "from-amber-700 to-amber-900", accent: "border-amber-500" },
  { bg: "from-rose-700 to-rose-900", accent: "border-rose-500" },
  { bg: "from-violet-700 to-violet-900", accent: "border-violet-500" },
];

interface PersistedConfig {
  playerCount: number;
  startingLife: StartingLife;
  playerNames: string[];
}

function loadConfig(): PersistedConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.playerCount === "number" &&
      typeof parsed?.startingLife === "number" &&
      Array.isArray(parsed?.playerNames)
    ) {
      return parsed as PersistedConfig;
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
    commanderDamage: Array.from({ length: players.length }, (_, i) => p.commanderDamage[i] ?? 0),
  }));
}

export function LifeTracker() {
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [startingLife, setStartingLife] = useState<StartingLife>(40);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [showCmdrFor, setShowCmdrFor] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Restore config on mount.
  useEffect(() => {
    const cfg = loadConfig();
    if (cfg) {
      setPlayerCount(cfg.playerCount);
      setStartingLife(cfg.startingLife as StartingLife);
      setPlayers(
        ensureCmdrSlots(
          Array.from({ length: cfg.playerCount }, (_, i) =>
            makePlayer(i, cfg.startingLife, cfg.playerNames[i] ?? `Player ${i + 1}`),
          ),
        ),
      );
    } else {
      setPlayers(
        ensureCmdrSlots(
          Array.from({ length: 4 }, (_, i) => makePlayer(i, 40, `Player ${i + 1}`)),
        ),
      );
    }
  }, []);

  // Persist config when it changes.
  useEffect(() => {
    if (players.length === 0) return;
    saveConfig({
      playerCount,
      startingLife,
      playerNames: players.map((p) => p.name),
    });
  }, [playerCount, startingLife, players]);

  function adjustLife(playerIdx: number, delta: number) {
    setPlayers((cur) =>
      cur.map((p, i) => {
        if (i !== playerIdx) return p;
        return {
          ...p,
          life: p.life + delta,
          history: [...p.history, { kind: "life", delta }],
        };
      }),
    );
  }

  function adjustPoison(playerIdx: number, delta: number) {
    setPlayers((cur) =>
      cur.map((p, i) => {
        if (i !== playerIdx) return p;
        const nextPoison = Math.max(0, p.poison + delta);
        const actualDelta = nextPoison - p.poison;
        return {
          ...p,
          poison: nextPoison,
          history: actualDelta !== 0
            ? [...p.history, { kind: "poison", delta: actualDelta }]
            : p.history,
        };
      }),
    );
  }

  function adjustCmdrDmg(playerIdx: number, opponentIdx: number, delta: number) {
    setPlayers((cur) =>
      cur.map((p, i) => {
        if (i !== playerIdx) return p;
        const cur = p.commanderDamage[opponentIdx] ?? 0;
        const next = Math.max(0, cur + delta);
        const actualDelta = next - cur;
        const dmg = [...p.commanderDamage];
        dmg[opponentIdx] = next;
        return {
          ...p,
          commanderDamage: dmg,
          // CR 903.14a — commander damage is also damage, so apply to life too.
          life: p.life - actualDelta,
          history: actualDelta !== 0
            ? [
                ...p.history,
                { kind: "cmdrDmg", delta: actualDelta, fromOpponent: opponentIdx },
              ]
            : p.history,
        };
      }),
    );
  }

  function undo(playerIdx: number) {
    setPlayers((cur) =>
      cur.map((p, i) => {
        if (i !== playerIdx || p.history.length === 0) return p;
        const last = p.history[p.history.length - 1];
        const history = p.history.slice(0, -1);
        if (last.kind === "life") {
          return { ...p, life: p.life - last.delta, history };
        }
        if (last.kind === "poison") {
          return { ...p, poison: Math.max(0, p.poison - last.delta), history };
        }
        // cmdrDmg — roll back both the per-opponent grid and life
        if (last.kind === "cmdrDmg" && last.fromOpponent !== undefined) {
          const dmg = [...p.commanderDamage];
          dmg[last.fromOpponent] = Math.max(0, (dmg[last.fromOpponent] ?? 0) - last.delta);
          return { ...p, commanderDamage: dmg, life: p.life + last.delta, history };
        }
        return p;
      }),
    );
  }

  function rename(playerIdx: number, name: string) {
    setPlayers((cur) =>
      cur.map((p, i) => (i === playerIdx ? { ...p, name: name.slice(0, 24) } : p)),
    );
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

  // Grid columns scale with player count to keep cards readable.
  const gridCols =
    playerCount <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : playerCount === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : playerCount === 4
          ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
          : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      {/* Setup bar */}
      <section className="panel p-3 sm:p-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl text-amber-300">Life Tracker</h1>
          <p className="text-[10px] sm:text-xs text-zinc-400">
            Built for at-the-table use. Commander damage tracked per opponent (CR 903.14a) — 21+ from a single commander = loss.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <label className="flex items-center gap-1 text-xs">
            <span className="text-zinc-400">Players</span>
            <select
              value={playerCount}
              onChange={(e) => applyPlayerCount(Number(e.target.value))}
              className="bg-bg-raised border border-bg-border rounded px-2 py-1"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs">
            <span className="text-zinc-400">Starting life</span>
            <select
              value={startingLife}
              onChange={(e) => applyStartingLife(Number(e.target.value) as StartingLife)}
              className="bg-bg-raised border border-bg-border rounded px-2 py-1"
            >
              <option value={40}>40 (Commander)</option>
              <option value={30}>30 (Brawl / Oathbreaker)</option>
              <option value={20}>20 (Standard)</option>
            </select>
          </label>
          <button
            onClick={() => setConfirmReset(true)}
            className="btn btn-ghost text-xs"
            title="Reset all players to starting life with empty history"
          >
            ↺ New game
          </button>
        </div>
      </section>

      {/* Player grid */}
      <div className={`grid ${gridCols} gap-3`}>
        {players.map((p, i) => (
          <PlayerCard
            key={p.id}
            player={p}
            index={i}
            startingLife={startingLife}
            onLifeChange={(d) => adjustLife(i, d)}
            onPoisonChange={(d) => adjustPoison(i, d)}
            onRename={(name) => rename(i, name)}
            onUndo={() => undo(i)}
            onOpenCmdrDmg={() => setShowCmdrFor(i)}
            color={COLORS[i % COLORS.length]}
          />
        ))}
      </div>

      {/* Commander damage modal */}
      {showCmdrFor !== null && (
        <CommanderDamageModal
          target={players[showCmdrFor]}
          targetIndex={showCmdrFor}
          opponents={players}
          onAdjust={(opponentIdx, delta) => adjustCmdrDmg(showCmdrFor, opponentIdx, delta)}
          onClose={() => setShowCmdrFor(null)}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Start a new game?"
        message="Every player will reset to starting life, with poison and commander damage cleared."
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
  onLifeChange,
  onPoisonChange,
  onRename,
  onUndo,
  onOpenCmdrDmg,
  color,
}: {
  player: PlayerState;
  index: number;
  startingLife: number;
  onLifeChange: (delta: number) => void;
  onPoisonChange: (delta: number) => void;
  onRename: (name: string) => void;
  onUndo: () => void;
  onOpenCmdrDmg: () => void;
  color: { bg: string; accent: string };
}) {
  const dead = player.life <= 0;
  const poisoned = player.poison >= 10;
  const maxCmdrDmg = Math.max(0, ...player.commanderDamage);
  const cmdrKilled = maxCmdrDmg >= 21;
  const eliminated = dead || poisoned || cmdrKilled;

  return (
    <article
      className={`relative panel overflow-hidden border-2 ${
        eliminated ? "border-red-700 opacity-70" : color.accent
      } bg-gradient-to-br ${color.bg}`}
    >
      {eliminated && (
        <div className="absolute top-2 right-2 z-10 text-[10px] uppercase tracking-wider font-bold bg-red-700 text-white px-2 py-0.5 rounded">
          {dead ? "0 LIFE" : cmdrKilled ? "CMDR DMG" : "POISON"}
        </div>
      )}
      <div className="p-3 space-y-2">
        <input
          value={player.name}
          maxLength={24}
          onChange={(e) => onRename(e.target.value)}
          className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder:text-white/50"
          aria-label={`Player ${index + 1} name`}
        />

        {/* Life — big tap targets. Hold for 10× already-fast, single tap is 1. */}
        <div className="flex items-stretch gap-2">
          <button
            onClick={() => onLifeChange(-5)}
            className="flex-1 bg-black/30 hover:bg-black/50 text-white text-lg font-mono py-2 rounded transition active:scale-95"
            aria-label="−5 life"
          >
            −5
          </button>
          <button
            onClick={() => onLifeChange(-1)}
            className="flex-1 bg-black/40 hover:bg-black/60 text-white text-2xl font-mono py-2 rounded transition active:scale-95"
            aria-label="−1 life"
          >
            −1
          </button>
          <div className="flex-[2] flex flex-col items-center justify-center min-w-0">
            <div
              className={`font-mono text-5xl sm:text-6xl leading-none ${
                player.life > startingLife / 2
                  ? "text-white"
                  : player.life > 10
                    ? "text-yellow-200"
                    : "text-red-200"
              }`}
            >
              {player.life}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-white/60 mt-1">life</div>
          </div>
          <button
            onClick={() => onLifeChange(1)}
            className="flex-1 bg-black/40 hover:bg-black/60 text-white text-2xl font-mono py-2 rounded transition active:scale-95"
            aria-label="+1 life"
          >
            +1
          </button>
          <button
            onClick={() => onLifeChange(5)}
            className="flex-1 bg-black/30 hover:bg-black/50 text-white text-lg font-mono py-2 rounded transition active:scale-95"
            aria-label="+5 life"
          >
            +5
          </button>
        </div>

        {/* Secondary counters */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button
            onClick={() => onPoisonChange(1)}
            onContextMenu={(e) => {
              e.preventDefault();
              onPoisonChange(-1);
            }}
            className="bg-black/30 hover:bg-black/50 rounded py-1.5 px-2 text-white flex flex-col items-center transition"
            title="Click to add poison, right-click to remove"
          >
            <span className="font-mono text-base">{player.poison}</span>
            <span className="text-[9px] uppercase tracking-wider text-white/60">☠ poison</span>
          </button>
          <button
            onClick={onOpenCmdrDmg}
            className="bg-black/30 hover:bg-black/50 rounded py-1.5 px-2 text-white flex flex-col items-center transition"
            title="Track commander damage from each opponent"
          >
            <span className="font-mono text-base">{maxCmdrDmg}</span>
            <span className="text-[9px] uppercase tracking-wider text-white/60">⚔ cmdr dmg</span>
          </button>
          <button
            onClick={onUndo}
            disabled={player.history.length === 0}
            className="bg-black/30 hover:bg-black/50 disabled:opacity-30 disabled:cursor-not-allowed rounded py-1.5 px-2 text-white flex flex-col items-center transition"
            title="Undo last change"
          >
            <span className="font-mono text-base">↺</span>
            <span className="text-[9px] uppercase tracking-wider text-white/60">undo</span>
          </button>
        </div>
      </div>
    </article>
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
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-[fadeIn_120ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md p-4 sm:p-5 space-y-3 animate-[popIn_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg text-amber-300">Commander damage to {target.name}</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              21 from any single commander loses the game (CR 903.14a). Adjusting here also drops the target&rsquo;s life total.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <ul className="space-y-1.5">
          {opponents.map((opp, i) => {
            if (i === targetIndex) return null; // can't deal cmdr dmg to yourself
            const dmg = target.commanderDamage[i] ?? 0;
            const lethal = dmg >= 21;
            return (
              <li
                key={opp.id}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                  lethal
                    ? "border-red-600 bg-red-900/30"
                    : "border-bg-border bg-bg-raised"
                }`}
              >
                <span className="flex-1 text-sm text-zinc-200 truncate">{opp.name}&rsquo;s commander</span>
                <button
                  onClick={() => onAdjust(i, -1)}
                  disabled={dmg === 0}
                  className="w-8 h-8 rounded bg-black/40 hover:bg-black/60 disabled:opacity-30 text-white font-mono"
                  aria-label="Decrease commander damage"
                >
                  −
                </button>
                <span className={`font-mono text-lg w-8 text-center ${lethal ? "text-red-200" : "text-zinc-100"}`}>
                  {dmg}
                </span>
                <button
                  onClick={() => onAdjust(i, 1)}
                  className="w-8 h-8 rounded bg-amber-700 hover:bg-amber-600 text-white font-mono"
                  aria-label="Increase commander damage"
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
