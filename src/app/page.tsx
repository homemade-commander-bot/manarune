import { Header } from "@/components/Header";
import { DeckLibrary } from "@/components/DeckLibrary";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <DeckLibrary />
      </main>
    </>
  );
}
