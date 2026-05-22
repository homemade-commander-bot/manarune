import { Suspense } from "react";
import { Header } from "@/components/Header";
import { CommanderPicker } from "@/components/CommanderPicker";

// CommanderPicker uses useSearchParams() to read the optional
// ?replace=<deckId> intent flag. Next.js 15 requires any component
// that calls useSearchParams() to be wrapped in <Suspense> so the
// rest of the page can be statically prerendered while the
// search-param-dependent subtree defers to client render.
export default function CommandersPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Suspense fallback={<PickerLoading />}>
          <CommanderPicker />
        </Suspense>
      </main>
    </>
  );
}

// Suspense fallback rendered during the static prerender and the
// brief moment between hydration and the CommanderPicker mounting.
// Visually mirrors the picker's own skeleton grid so the transition
// to client state doesn't reflow the page.
function PickerLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <section className="panel p-6">
        <h1 className="font-display text-3xl text-violet-400">Choose Your Commander</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Loading commander database from Scryfall…
        </p>
      </section>
      <section>
        <div className="text-sm uppercase tracking-wider text-zinc-400 mb-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            Preparing…
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-[5/7] rounded-lg bg-bg-raised border border-bg-border" />
              <div className="space-y-1">
                <div className="h-3 bg-bg-raised rounded w-3/4" />
                <div className="h-2 bg-bg-raised rounded w-1/2" />
                <div className="h-7 bg-bg-raised rounded mt-1" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
