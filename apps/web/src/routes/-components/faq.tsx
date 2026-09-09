import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Chip } from "./chip";

// One flat list: every question in reading order, no category rail to
// click through first. The first answer speaks in the owner's voice.
const items: Array<{ question: string; answer: ReactNode }> = [
  {
    question: "What is AI driven development?",
    answer: (
      <>
        <p>
          The definition changes fast: loops, software factories, swarms. What I actually want is simple. I want my agents to be able to work concurrently on multiple
          issues without clashing, and before I review code I want to check the result.
        </p>
        <p>
          The flow I run today: I assign the PR through{" "}
          <a href="https://paseo.sh" target="_blank" rel="noreferrer" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
            paseo
          </a>{" "}
          (paseo.sh), and when the agent is finished I get an email once the pull request is created that includes a link to an isolated deployment for me to review.
          proof ships that flow on day one.
        </p>
      </>
    ),
  },
  {
    question: "What is a proof?",
    answer:
      "The running app for one pull request: its own stage, its own database and bucket, destroyed when the PR merges. You review the proof; the diff is for the compiler.",
  },
  {
    question: "What is the view concept?",
    answer:
      "Views are pure functions that project a database row into the exact shape the browser needs, signed links included, in the one place that authorizes. Storage keys never leave the backend, and the shape that arrives is the shape you render.",
  },
  {
    question: "How do I add a new feature?",
    answer:
      "Write the issue, hand it to an agent, and it works in a worktree (bun scripts/wt.ts) on its own branch and stage. You get a pull request with a preview URL: check the app, mark it up, merge.",
  },
  {
    question: "What happens on merge?",
    answer:
      "Migrations ride the production deploy, and the preview stage is destroyed. A readiness check blocks the merge until the setup checklist (domain, sender address, credentials) is whole.",
  },
  {
    question: "What if I have no domain yet?",
    answer:
      "Day zero works on platform URLs with email captured to logs. Setting ROOT_DOMAIN later upgrades every stage on the next deploy; nothing in the database stores an absolute URL.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell py-20 sm:py-24">
        <Chip>F.A.Q</Chip>
        <h2 className="mt-6 text-4xl font-normal leading-[1.1] tracking-[-0.24px] text-foreground">Have questions?</h2>
        <p className="mt-3 max-w-[633px] text-sm leading-relaxed text-zinc-500 dark:text-zinc-500">
          The short answers. The full ledger, with reasoning, lives in docs/faq.md.
        </p>
        <div className="mt-10 max-w-3xl">
          <Accordion type="single" collapsible>
            {items.map((item, index) => (
              <AccordionItem key={item.question} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-base font-semibold">{item.question}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
            More in the{" "}
            <a href="https://github.com/Fawwaz-2009/proof/blob/main/docs/faq.md" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
              full decisions ledger
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
