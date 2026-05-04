import { Header } from "@/components/Header";
import { CommanderPicker } from "@/components/CommanderPicker";

export default function CommandersPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <CommanderPicker />
      </main>
    </>
  );
}
