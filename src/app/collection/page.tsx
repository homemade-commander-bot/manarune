import { Header } from "@/components/Header";
import { CollectionView } from "@/components/CollectionView";

export const metadata = { title: "Collection — Commander Forge" };

export default function CollectionPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <CollectionView />
      </main>
    </div>
  );
}
