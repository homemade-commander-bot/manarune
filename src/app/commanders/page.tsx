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

function PickerLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-12 text-center text-zinc-500">
      Loading commander picker…
    </div>
  );
}
