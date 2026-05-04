"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeckStore } from "@/lib/store";
import { toDeckText, toMarkdown } from "@/lib/export";
import type { Deck } from "@/lib/types";

export function DeckActions({ deck }: { deck: Deck }) {
  const router = useRouter();
  const { renameDeck, deleteDeck } = useDeckStore();
  const [open, setOpen] = useState<null | "txt" | "md">(null);

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  function downloadFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel p-3 space-y-2">
      <input
        value={deck.name}
        onChange={(e) => renameDeck(deck.id, e.target.value)}
        className="w-full bg-bg-raised border border-bg-border rounded px-2 py-1 font-display text-amber-400"
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost" onClick={() => setOpen("txt")}>Export .txt</button>
        <button className="btn btn-ghost" onClick={() => setOpen("md")}>Export .md</button>
        <button
          className="btn btn-danger ml-auto"
          onClick={() => {
            if (confirm(`Delete "${deck.name}"? This cannot be undone.`)) {
              deleteDeck(deck.id);
              router.push("/");
            }
          }}
        >
          Delete
        </button>
      </div>

      {open && (
        <div className="bg-bg-raised border border-bg-border rounded p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">{open === "txt" ? "MTGO/Arena format" : "Markdown"}</span>
            <div className="flex gap-1">
              <button
                onClick={() => copy(open === "txt" ? toDeckText(deck) : toMarkdown(deck))}
                className="text-xs underline text-amber-400"
              >
                Copy
              </button>
              <button
                onClick={() =>
                  downloadFile(
                    `${deck.name.replace(/[^a-z0-9]+/gi, "_")}.${open === "txt" ? "txt" : "md"}`,
                    open === "txt" ? toDeckText(deck) : toMarkdown(deck),
                  )
                }
                className="text-xs underline text-amber-400"
              >
                Download
              </button>
              <button onClick={() => setOpen(null)} className="text-xs text-zinc-400">Close</button>
            </div>
          </div>
          <pre className="text-[10px] max-h-40 overflow-auto whitespace-pre-wrap text-zinc-300">
            {open === "txt" ? toDeckText(deck) : toMarkdown(deck)}
          </pre>
        </div>
      )}
    </div>
  );
}
