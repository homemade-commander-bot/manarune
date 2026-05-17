import { ForceLandscape } from "@/components/ForceLandscape";
import { LifeTracker } from "@/components/LifeTracker";

export const metadata = { title: "Life Tracker — Manarune" };

// The life tracker is the one screen designed for a phone laid flat
// in the middle of a table — so we drop the site header (saves ~50px
// for the player cards) and force a landscape coordinate system
// regardless of how the phone is oriented in the user's hand.
export default function PlayPage() {
  return (
    <ForceLandscape>
      <LifeTracker />
    </ForceLandscape>
  );
}
