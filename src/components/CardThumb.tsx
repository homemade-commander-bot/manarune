"use client";

import React, { useState } from "react";
import type { Card } from "@/lib/types";
import { frontImage } from "@/lib/scryfall";

export function CardThumb({
  card,
  size = "small",
  onClick,
  className = "",
}: {
  card: Card;
  size?: "small" | "normal" | "large";
  onClick?: () => void;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const url = frontImage(card, size as "small" | "normal" | "large");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-lg overflow-hidden card-shadow bg-bg-raised border border-bg-border hover:ring-2 hover:ring-violet-500/60 transition ${className}`}
      title={card.name}
    >
      {url && !errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={card.name}
          className="w-full h-auto block"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="aspect-[5/7] flex items-center justify-center text-xs text-zinc-400 p-2 text-center">
          {card.name}
        </div>
      )}
    </button>
  );
}
