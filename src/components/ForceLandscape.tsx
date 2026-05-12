"use client";

// Forces its children into a landscape coordinate system regardless
// of the device orientation. Built for the life tracker — players
// sit around a table with the phone laid flat in the middle, so it
// doesn't matter how the phone is "held": they want a wide layout
// that fits all four player cards on one screen.
//
// CSS-only via Tailwind's `portrait:` variant:
//   • When the screen is portrait, we rotate the inner box 90° around
//     the top-left corner and translate it back into view. The inner
//     box's logical width is 100dvh and height is 100dvw, so its
//     contents render as if they were on a landscape canvas.
//   • When the screen is landscape, no rotation; the wrapper just
//     becomes a full-viewport container.
//
// Children must be tolerant of being inside a non-scrolling fixed
// container — that's what the life tracker is designed for.

import { useEffect } from "react";

export function ForceLandscape({ children }: { children: React.ReactNode }) {
  // Lock body scroll while this wrapper is mounted. The rotation
  // would otherwise produce a weirdly-positioned scroll axis on
  // portrait phones.
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div
      className="
        fixed inset-0 overflow-hidden bg-bg-base
        landscape:flex landscape:flex-col
      "
    >
      <div
        className="
          landscape:w-full landscape:h-full landscape:flex landscape:flex-col
          portrait:absolute portrait:top-0 portrait:left-0 portrait:origin-top-left
          portrait:w-[100dvh] portrait:h-[100dvw]
          portrait:translate-x-[100dvw] portrait:rotate-90
          flex flex-col
        "
      >
        {children}
      </div>
    </div>
  );
}
