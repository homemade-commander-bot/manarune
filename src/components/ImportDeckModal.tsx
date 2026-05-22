"use client";

// Deck importer. Three input modes:
//   1. Paste a plain-text decklist (Moxfield/Archidekt/MTGGoldfish
//      text export, or a hand-rolled list — the parser is permissive)
//   2. Paste a Moxfield URL (or just the deck id)
//   3. Future: Scryfall deck URL
//
// After parsing/fetching, we resolve every card name against Scryfall
// in one batched POST and show a preview: how many cards matched, what
// the commanders look like, and which names didn't resolve so the
// user can fix typos before importing.
//
// Optional "also add to collection" checkbox adds 1 non-foil of every
// imported card to the fast-add collection group.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  extractMoxfieldId,
  fetchMoxfieldDeck,
  parseTextDecklist,
  resolveDeck,
  type ResolvedDeck,
} from "@/lib/import";
import { useDeckStore, DEFAULT_GROUP_ID } from "@/lib/store";
import { canBeCommander } from "@/lib/commander-rules";
import { frontImage } from "@/lib/scryfall";
import type { Card } from "@/lib/types";

type Mode = "text" | "url";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportDeckModal({ open, onClose }: Props) {
  const router = useRouter();
  const {
    createDeck,
    setActiveDeck,
    setCommander,
    setPartner,
    renameDeck,
    addCard,
    addToCollection,
  } = useDeckStore();
  const fastAddGroupId = useDeckStore(
    (s) => s.profile.fastAddGroupId ?? DEFAULT_GROUP_ID,
  );

  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [deckName, setDeckName] = useState("");
  const [addToColl, setAddToColl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ResolvedDeck | null>(null);

  function reset() {
    setText("");
    setUrl("");
    setDeckName("");
    setAddToColl(false);
    setPreview(null);
    setError(null);
    setLoading(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function runPreview() {
    setError(null);
    setLoading(true);
    setPreview(null);
    try {
      let parsed;
      if (mode === "text") {
        if (!text.trim()) throw new Error("Paste a decklist to preview.");
        parsed = parseTextDecklist(text);
      } else {
        const id = extractMoxfieldId(url);
        if (!id) {
          throw new Error("That doesn't look like a Moxfield URL or deck id.");
        }
        parsed = await fetchMoxfieldDeck(id);
      }
      if (parsed.entries.length === 0 && parsed.commanderNames.length === 0) {
        throw new Error("Nothing recognizable in that input.");
      }
      const resolved = await resolveDeck(parsed);
      setPreview(resolved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import preview failed.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setLoading(true);
    try {
      const name = deckName.trim() || preview.parsed.commanderNames[0] || "Imported deck";
      const deckId = createDeck(name);
      setActiveDeck(deckId);
      renameDeck(deckId, name);

      // Commander(s) — first one becomes primary, second (if any
      // matches legality) becomes partner.
      const cmd1Name = preview.parsed.commanderNames[0];
      const cmd2Name = preview.parsed.commanderNames[1];
      const cmd1 = cmd1Name ? preview.matched.get(cmd1Name.toLowerCase()) : undefined;
      const cmd2 = cmd2Name ? preview.matched.get(cmd2Name.toLowerCase()) : undefined;
      if (cmd1 && canBeCommander(cmd1)) setCommander(deckId, cmd1);
      if (cmd2 && canBeCommander(cmd2)) setPartner(deckId, cmd2);

      // Mainboard. addCard's singleton check at the store level means
      // duplicate-by-name printings collapse harmlessly.
      for (const entry of preview.parsed.entries) {
        const card = preview.matched.get(entry.name.toLowerCase());
        if (!card) continue;
        addCard(deckId, card, entry.quantity);
      }

      // Optional: mirror into the collection. We add 1 of each matched
      // card to the user's fast-add group, regardless of the deck
      // entry's quantity, because owning multiples of a singleton-
      // commander card is rarely what the user actually has.
      if (addToColl) {
        const seen = new Set<string>();
        for (const card of preview.matched.values()) {
          if (seen.has(card.id)) continue;
          seen.add(card.id);
          addToCollection(card, 1, false, fastAddGroupId);
        }
      }

      close();
      router.push("/build");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-[fadeIn_120ms_ease-out]"
      onClick={close}
    >
      <div
        className="panel w-full max-w-2xl max-h-[90vh] flex flex-col animate-[popIn_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 p-4 sm:p-5 border-b border-bg-border">
          <div>
            <h2 className="font-display text-xl text-violet-300">Import a deck</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Paste a decklist or a Moxfield URL. Scryfall resolves every card name.
            </p>
          </div>
          <button onClick={close} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {!preview && (
            <>
              {/* Mode tabs */}
              <div className="flex items-center gap-1 panel p-1 self-start">
                <ModeTab active={mode === "text"} onClick={() => setMode("text")}>📋 Paste list</ModeTab>
                <ModeTab active={mode === "url"} onClick={() => setMode("url")}>🔗 Moxfield URL</ModeTab>
              </div>

              {mode === "text" && (
                <label className="block">
                  <div className="text-xs text-zinc-400 mb-1">Decklist</div>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={10}
                    placeholder={`Paste any text decklist. Examples:

Commander
1 Tergrid, God of Fright

Deck
1 Sol Ring
1 Arcane Signet
1 Burglar Rat
...`}
                    className="w-full bg-bg-raised border border-bg-border rounded px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500/60"
                    maxLength={50000}
                  />
                  <div className="text-[10px] text-zinc-500 mt-1">
                    Handles Moxfield, Archidekt, MTGGoldfish, TappedOut text exports.
                    Set codes and foil markers are ignored — only card names matter.
                  </div>
                </label>
              )}

              {mode === "url" && (
                <label className="block">
                  <div className="text-xs text-zinc-400 mb-1">Moxfield deck URL or id</div>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://moxfield.com/decks/abcDEF123"
                    className="w-full bg-bg-raised border border-bg-border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/60"
                    maxLength={500}
                  />
                  <div className="text-[10px] text-zinc-500 mt-1">
                    Deck must be public. We never see your Moxfield account.
                  </div>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-bg-border">
                <button onClick={close} className="btn btn-ghost">Cancel</button>
                <button
                  onClick={runPreview}
                  disabled={loading || (mode === "text" ? !text.trim() : !url.trim())}
                  className="btn btn-primary"
                >
                  {loading ? "Resolving…" : "Preview"}
                </button>
              </div>
            </>
          )}

          {preview && (
            <ImportPreview
              resolved={preview}
              deckName={deckName}
              onChangeDeckName={setDeckName}
              addToColl={addToColl}
              onToggleCollection={() => setAddToColl((v) => !v)}
              onBack={() => setPreview(null)}
              onConfirm={confirmImport}
              loading={loading}
            />
          )}

          {error && (
            <div className="rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium transition ${
        active ? "bg-violet-600 text-white" : "text-zinc-300 hover:bg-bg-raised"
      }`}
    >
      {children}
    </button>
  );
}

function ImportPreview({
  resolved,
  deckName,
  onChangeDeckName,
  addToColl,
  onToggleCollection,
  onBack,
  onConfirm,
  loading,
}: {
  resolved: ResolvedDeck;
  deckName: string;
  onChangeDeckName: (s: string) => void;
  addToColl: boolean;
  onToggleCollection: () => void;
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const matchedCount = resolved.totalQuantity;
  const missingCount = resolved.missing.length;
  const commanders = resolved.parsed.commanderNames
    .map((n) => resolved.matched.get(n.toLowerCase()))
    .filter((c): c is Card => !!c);

  const cmdPlaceholder = commanders[0]?.name ?? "Imported deck";

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Matched" value={String(matchedCount)} accent="emerald" />
        <Stat label="Commander(s)" value={String(commanders.length)} accent="violet" />
        <Stat label="Unmatched" value={String(missingCount)} accent={missingCount > 0 ? "red" : "muted"} />
      </div>

      {/* Commanders preview */}
      {commanders.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Commander(s)</div>
          <div className="flex gap-2 flex-wrap">
            {commanders.map((c) => {
              const img = frontImage(c, "small");
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-2 bg-bg-raised border border-bg-border rounded px-2 py-1"
                >
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={c.name} className="w-8 h-8 rounded object-cover" />
                  )}
                  <span className="text-sm text-violet-200 truncate max-w-[200px]">{c.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missing list — actionable, fix-your-typos info */}
      {missingCount > 0 && (
        <div className="rounded-md border border-yellow-700/40 bg-yellow-900/15 p-3">
          <div className="text-xs font-semibold text-yellow-200 mb-1">
            ⚠ {missingCount} card{missingCount === 1 ? "" : "s"} didn&rsquo;t match Scryfall
          </div>
          <ul className="text-[11px] text-yellow-100/80 space-y-0.5 max-h-32 overflow-y-auto font-mono">
            {resolved.missing.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="text-[10px] text-yellow-100/60 mt-1.5">
            Usually a typo or a card too new for Scryfall&rsquo;s mirror. You can still
            import the rest; fix these manually after the deck is created.
          </div>
        </div>
      )}

      {resolved.parsed.warnings.length > 0 && (
        <div className="rounded-md border border-zinc-700 bg-bg-raised p-3 text-[11px] text-zinc-400">
          <div className="font-semibold mb-1">{resolved.parsed.warnings.length} lines skipped:</div>
          <ul className="space-y-0.5 max-h-24 overflow-y-auto font-mono">
            {resolved.parsed.warnings.slice(0, 12).map((w, i) => (
              <li key={i} className="truncate">{w}</li>
            ))}
            {resolved.parsed.warnings.length > 12 && (
              <li className="opacity-60">… and {resolved.parsed.warnings.length - 12} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Deck name + collection toggle */}
      <label className="block">
        <div className="text-xs text-zinc-400 mb-1">Deck name</div>
        <input
          value={deckName}
          maxLength={80}
          onChange={(e) => onChangeDeckName(e.target.value)}
          placeholder={cmdPlaceholder}
          className="w-full bg-bg-raised border border-bg-border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/60"
        />
        <div className="text-[10px] text-zinc-500 mt-0.5">
          Leave blank to name the deck after the commander.
        </div>
      </label>

      <label className="flex items-start gap-2 cursor-pointer text-sm text-zinc-200">
        <input
          type="checkbox"
          checked={addToColl}
          onChange={onToggleCollection}
          className="accent-violet-500 mt-0.5"
        />
        <div>
          <div>Also add these cards to my collection</div>
          <div className="text-[10px] text-zinc-500">
            One copy of every matched card goes into your fast-add group. Useful when you
            already physically own the deck.
          </div>
        </div>
      </label>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-bg-border">
        <button onClick={onBack} className="btn btn-ghost" disabled={loading}>
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || matchedCount === 0}
          className="btn btn-primary"
        >
          {loading ? "Importing…" : `Import ${matchedCount} card${matchedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "emerald" | "violet" | "red" | "muted";
}) {
  const palette = {
    emerald: { bg: "border-emerald-700/40 bg-emerald-900/15", text: "text-emerald-200" },
    violet: { bg: "border-violet-700/40 bg-violet-900/15", text: "text-violet-200" },
    red: { bg: "border-red-700/40 bg-red-900/20", text: "text-red-200" },
    muted: { bg: "border-bg-border bg-bg-raised", text: "text-zinc-300" },
  }[accent];
  return (
    <div className={`rounded-md border px-2 py-1.5 ${palette.bg}`}>
      <div className={`font-mono text-lg leading-none ${palette.text}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-400 mt-1">{label}</div>
    </div>
  );
}
