import { Header } from "@/components/Header";

export default function RulesPage() {
  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 space-y-6">
        <h1 className="font-display text-3xl text-violet-400">Commander Format Reference</h1>
        <p className="text-zinc-400 text-sm">
          The app validates every deck against the rules below. Banlist updates flow automatically from
          Scryfall&rsquo;s legality data, so newly banned or unbanned cards are reflected without an app update.
          As of September 2024, Wizards of the Coast manages the Commander format directly with input from
          the Commander Format Panel; the independent Commander Rules Committee handed off stewardship at
          that time. For the canonical rules, see the{" "}
          <a className="text-violet-400 underline" href="https://magic.wizards.com/en/news/announcements/on-the-future-of-commander" target="_blank" rel="noopener noreferrer">
            WotC announcement
          </a>{" "}
          and{" "}
          <a className="text-violet-400 underline" href="https://magic.wizards.com/en/rules" target="_blank" rel="noopener noreferrer">
            Magic Comprehensive Rules §903
          </a>
          .
        </p>

        <Section title="Deck construction (CR 903.5)">
          <ul className="list-disc pl-5 space-y-1">
            <li>Exactly 100 cards including the commander(s).</li>
            <li>Singleton: no two cards may share an English name, except basic lands and cards with explicit &ldquo;A deck can have any number of cards named …&rdquo; text.</li>
            <li>Cards must be legal in the Commander format (no banned cards).</li>
          </ul>
        </Section>

        <Section title="Color identity (CR 903.4 &amp; 903.6)">
          <ul className="list-disc pl-5 space-y-1">
            <li>Color identity = mana symbols in cost + mana symbols in rules text + color indicator. Reminder text excluded.</li>
            <li>Every card in the deck must be within the union of the commanders&rsquo; color identities.</li>
            <li>Hybrid mana counts as both colors. {"{X}"}, generic, and snow do not contribute color.</li>
          </ul>
        </Section>

        <Section title="The commander (CR 903.3)">
          <ul className="list-disc pl-5 space-y-1">
            <li>Must be a legendary creature, OR a card whose rules text says it can be your commander.</li>
            <li>Begins the game in the command zone. May be cast from there for an additional {"{2}"} per prior cast (commander tax).</li>
            <li>If your commander would change zones to library, hand, graveyard, or exile, you may move it to the command zone instead (903.9).</li>
            <li>21 combat damage from a single commander to a player makes that player lose the game (903.14a).</li>
          </ul>
        </Section>

        <Section title="Partner &amp; Background (CR 903.5b)">
          <ul className="list-disc pl-5 space-y-1">
            <li>Two commanders, each with the Partner keyword, may be used together. Their color identities combine.</li>
            <li>&ldquo;Partner with [name]&rdquo; commanders pair only with the named card.</li>
            <li>A commander with &ldquo;Choose a Background&rdquo; may take a Background enchantment as its second commander.</li>
            <li>&ldquo;Friends forever&rdquo; and &ldquo;Doctor&rsquo;s companion&rdquo; behave like Partner with their stated restrictions.</li>
          </ul>
        </Section>

        <Section title="Game setup (CR 903.7–903.8)">
          <ul className="list-disc pl-5 space-y-1">
            <li>Each player starts at 40 life.</li>
            <li>Mulligan to seven (London Mulligan): draw 7, place N cards on the bottom for the Nth mulligan.</li>
            <li>Free-for-all multiplayer with shared turn structure; first player draws on their first turn.</li>
          </ul>
        </Section>

        <Section title="Win &amp; loss conditions (CR 104, 903.14)">
          <ul className="list-disc pl-5 space-y-1">
            <li>Reduce a player to 0 or less life.</li>
            <li>Deck out: a player draws from an empty library.</li>
            <li>10+ poison counters.</li>
            <li>21 combat damage from a single commander.</li>
            <li>Card-defined alternate wins (e.g., Approach of the Second Sun, Laboratory Maniac).</li>
          </ul>
        </Section>

        <Section title="Banlist (current, via Scryfall)">
          <p className="text-zinc-300 text-sm">
            The app checks Commander legality using Scryfall&rsquo;s{" "}
            <code className="bg-bg-raised px-1 rounded">legalities.commander</code> field, which tracks the
            authoritative banlist. Format management is now handled by Wizards of the Coast with input from
            the Commander Format Panel (transitioned from the independent Commander Rules Committee in
            September 2024). For the current banned and restricted list, verify against{" "}
            <a className="text-violet-400 underline" href="https://magic.wizards.com/en/banned-and-restricted-list" target="_blank" rel="noopener noreferrer">
              Wizards&rsquo; official banned &amp; restricted list
            </a>
            .
          </p>
        </Section>

        <Section title="Sources">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li><a className="underline text-violet-400" href="https://magic.wizards.com/en/rules" target="_blank" rel="noopener noreferrer">Magic: The Gathering Comprehensive Rules</a> — §903 covers Commander.</li>
            <li><a className="underline text-violet-400" href="https://magic.wizards.com/en/news/announcements/on-the-future-of-commander" target="_blank" rel="noopener noreferrer">On the Future of Commander</a> — WotC&rsquo;s Sept 2024 announcement taking over format management.</li>
            <li><a className="underline text-violet-400" href="https://magic.wizards.com/en/banned-and-restricted-list" target="_blank" rel="noopener noreferrer">Official banned &amp; restricted list</a></li>
            <li><a className="underline text-violet-400" href="https://blogs.magicjudges.org/rules/" target="_blank" rel="noopener noreferrer">MTG Judges blog</a></li>
            <li><a className="underline text-violet-400" href="https://scryfall.com/docs/api" target="_blank" rel="noopener noreferrer">Scryfall API</a> (card data, legality, rulings)</li>
          </ul>
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="font-display text-xl text-violet-400 mb-2">{title}</h2>
      <div className="text-zinc-200 text-sm space-y-1">{children}</div>
    </section>
  );
}
