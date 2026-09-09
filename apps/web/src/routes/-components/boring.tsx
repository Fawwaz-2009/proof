import { Chip } from "./chip";

// Two-column tree rows: name left, what it is right. The glyphs are the
// box-drawing prefix for each depth, dimmed like the reference boards.
const rows: Array<{ glyph: string; name: string; desc?: string; root?: boolean }> = [
  { glyph: "", name: "proof", root: true },
  { glyph: "├─ ", name: "alchemy.run.ts", desc: "one stack: providers, state, the units" },
  { glyph: "├─ ", name: "website.ts", desc: "the public deploy unit, sole ingress" },
  { glyph: "├─ ", name: "apps" },
  { glyph: "│  ├─ ", name: "backend" },
  { glyph: "│  │  ├─ ", name: "config", desc: "infra room: D1, R2, auth, limits, hosts" },
  { glyph: "│  │  ├─ ", name: "src/contracts", desc: "the shared, typed HTTP interface" },
  { glyph: "│  │  ├─ ", name: "src/controllers", desc: "adapt payloads, yield services" },
  { glyph: "│  │  ├─ ", name: "src/domain", desc: "business rules as services" },
  { glyph: "│  │  ├─ ", name: "src/views", desc: "row to wire shape, signed links included" },
  { glyph: "│  │  └─ ", name: "migrations", desc: "committed SQL, replayed per stage" },
  { glyph: "│  └─ ", name: "web", desc: "TanStack Start site, typed client, auth gate" },
  { glyph: "├─ ", name: "docs/faq.md", desc: "every decision, question-shaped" },
  { glyph: "├─ ", name: "stacks/github.ts", desc: "the one-time credential ceremony" },
  { glyph: "└─ ", name: "scripts/wt.ts", desc: "worktrees for parallel agents" },
];

// The inverted interlude: the page's one dark card, placed right after the
// built-with strip, carrying the section treatment the prompt section
// gave up.
export function Boring() {
  return (
    <section className="scroll-mt-20 border-t border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="shell grid items-center gap-12 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <Chip>Boring is a feature</Chip>
          <h2 className="mt-6 max-w-[827px] text-4xl font-normal leading-tight tracking-[-0.24px] text-foreground">The whole product fits in one screen.</h2>
          <p className="mt-4 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
            No magic directories, no hidden generators, no second framework hiding in the config: what you see is what deploys. An agent reads this tree in one prompt and
            knows where everything lives.
          </p>
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
            Every decision and its why:{" "}
            <a href="https://github.com/Fawwaz-2009/proof/blob/main/docs/faq.md" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
              docs/faq.md
            </a>
            .
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 font-mono text-[11px] leading-[1.9] shadow-lg sm:text-xs dark:border-zinc-700">
          {rows.map((row) => (
            <div key={row.name} className="grid grid-cols-[10.5rem_1fr] sm:grid-cols-[13rem_1fr]">
              <span className={`truncate whitespace-pre ${row.root ? "font-semibold text-zinc-100" : "text-zinc-200"}`}>
                <span className="text-zinc-700">{row.glyph}</span>
                {row.name}
              </span>
              <span className="truncate text-zinc-500">{row.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
