import { Header } from "@/components/Header";
import { LifeTracker } from "@/components/LifeTracker";

export const metadata = { title: "Life Tracker — Commander Forge" };

export default function PlayPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <LifeTracker />
      </main>
    </>
  );
}
