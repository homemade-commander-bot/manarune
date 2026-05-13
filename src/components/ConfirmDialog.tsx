"use client";

// In-app confirmation dialog. Replaces the browser-native confirm()
// dropdown with a styled modal that matches the rest of the UI. Used
// for destructive actions like deck deletion.
//
// Usage:
//   const [open, setOpen] = useState(false);
//   <ConfirmDialog
//     open={open}
//     title="Delete deck?"
//     message={`"${deck.name}" will be permanently removed.`}
//     confirmLabel="Delete"
//     destructive
//     onConfirm={() => { deleteDeck(deck.id); setOpen(false); }}
//     onCancel={() => setOpen(false)}
//   />

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button on open so Enter/Space don't accidentally
  // confirm a destructive action.
  useEffect(() => {
    if (open) {
      // Defer until after the modal is in the DOM
      const id = window.setTimeout(() => cancelBtnRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Close on Escape; confirm on Enter only when focus is on the
  // confirm button (default focus is cancel).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  // Portaled to document.body so the dialog escapes any rotated /
  // transformed ancestor (e.g. ForceLandscape on /play). Without
  // this, the rotated coordinate system would also rotate the
  // dialog, and the soft keyboard / tap zones land in the wrong
  // physical positions on a mobile device.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="panel max-w-sm w-full p-5 space-y-4 shadow-2xl border-bg-border animate-[popIn_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className={`flex-none w-10 h-10 rounded-full flex items-center justify-center text-xl ${
              destructive
                ? "bg-red-900/30 text-red-300 ring-1 ring-red-700/40"
                : "bg-amber-900/30 text-amber-300 ring-1 ring-amber-700/40"
            }`}
          >
            {destructive ? "⚠" : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="confirm-dialog-title"
              className="font-display text-lg text-amber-300 leading-tight"
            >
              {title}
            </h3>
            {message && (
              <p className="text-sm text-zinc-300 mt-1.5 leading-snug">{message}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            className="btn btn-ghost"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={destructive ? "btn btn-danger" : "btn btn-primary"}
            autoFocus={false}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
