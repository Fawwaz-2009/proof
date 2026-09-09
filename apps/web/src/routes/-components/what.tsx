import { Chip } from "./chip";

const flow = [
  { title: "Assign the issue", line: "paseo.sh, or any runner you like, hands the pull request to an agent. The template is runner-agnostic." },
  { title: "The agent builds in isolation", line: "Its own worktree, its own branch, its own hashed dev port. Parallel agents never share a checkout." },
  { title: "You get the email", line: "The pull request is ready, and the message carries a link to its own deployment." },
  { title: "You check the proof", line: "The real app, running isolated on your host. Data, auth, uploads: all of it live, all of it throwaway." },
  { title: "Mark it up or merge", line: "Comments go on the PR, and a push redeploys the preview. Merge ships it and destroys the stage." },
];

// One column, one width: the section makes its argument and shows the flow
// in the same measure the hero paragraph uses (633px), everything sharing
// the page's single container edge.
export function What() {
  return (
    <section id="what" className="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell py-20 sm:py-24">
        <Chip>What is AI driven development?</Chip>
        <h2 className="mt-6 max-w-[827px] text-4xl font-normal leading-[1.1] tracking-[-0.24px] text-foreground">
          The definition changes weekly. The useful part does not.
        </h2>
        <div className="mt-6 max-w-[633px] space-y-4 text-lg leading-7 text-muted-foreground">
          <p>
            Loops, software factories, swarms: the vocabulary reinvents itself faster than the tools ship. Under the noise sits one practical shift. Software stops being
            files you edit and becomes work you supervise.
          </p>
          <p>
            Two things decide whether that shift is real for you. Can your agents work concurrently on many issues without clashing? And can you check the result before
            you read a single line of the diff?
          </p>
          <p>proof answers both with structure, not trust:</p>
        </div>
        <ol className="mt-8 max-w-[633px] space-y-5">
          {flow.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="font-mono text-sm leading-6 text-zinc-400 dark:text-zinc-600">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-semibold leading-6 text-foreground">{step.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{step.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
