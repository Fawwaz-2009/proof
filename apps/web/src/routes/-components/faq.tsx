import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Chip } from "./chip";

type Item = { question: string; answer: string };

const categories: Array<{ id: string; num: string; label: string; items: Item[] }> = [
  {
    id: "start",
    num: "01",
    label: "Start",
    items: [
      {
        question: "What do I need before starting?",
        answer:
          "Bun 1.3 or newer, git, the gh CLI logged in, a Cloudflare account, and an agent in your terminal. The prompt handles the rest, including the one Cloudflare token that has to be made by hand.",
      },
      {
        question: "Why a prompt instead of a scaffold CLI?",
        answer:
          "The CLI automated what an agent now does better: read the repo, ask your app's name, walk you through credentials, and open the first pull request. A prompt is inspectable, editable, and cannot drift from the template it ships with, because the agent reads the actual files.",
      },
      {
        question: "What happens after I paste the prompt?",
        answer:
          "The agent renames the identity tokens to your app, walks you through the Cloudflare credential, runs the setup ceremony that mints the CI token and writes the repo secrets, then opens your first pull request. CI deploys a preview; you check the running app; merge ships it.",
      },
    ],
  },
  {
    id: "concepts",
    num: "02",
    label: "Concepts",
    items: [
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
        question: "What is the loop?",
        answer:
          'Issue, isolation, proof, markup, ship. An issue ends in a pull request with a running proof, never in the words "I\'m done". Markup redeploys the preview; merge ships production.',
      },
    ],
  },
  {
    id: "daily",
    num: "03",
    label: "Daily use",
    items: [
      {
        question: "How do I add a new feature?",
        answer:
          "Write the issue, hand it to an agent, and it works in a worktree (bun scripts/wt.ts) on its own branch and stage. You get a pull request with a preview URL: check the app, mark it up, merge.",
      },
      {
        question: "How do forms and validation work?",
        answer:
          "One Effect Schema per endpoint. React Hook Form validates the form through the same schema the wire contract uses, so the client error and the server error carry the same message.",
      },
    ],
  },
  {
    id: "ops",
    num: "04",
    label: "Operations",
    items: [
      {
        question: "What can I configure?",
        answer:
          "Identity is configuration, not code: APP_NAME (what people read), APP_SLUG (the hostname prefix), ROOT_DOMAIN, and AUTH_EMAIL_FROM. One rule: never rename the stack name in alchemy.run.ts after the first deploy, or you orphan your database and bucket.",
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
    ],
  },
];

export function Faq() {
  const [active, setActive] = useState<string>(categories[0]?.id ?? "start");
  const current = categories.find((category) => category.id === active) ?? categories[0];
  if (!current) return null;

  return (
    <section id="faq" className="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell py-20 sm:py-24">
        <Chip>F.A.Q</Chip>
        <h2 className="text-4xl font-normal leading-[1.1] tracking-[-0.24px] text-foreground">Have questions?</h2>
        <p className="mt-3 max-w-[633px] text-sm leading-relaxed text-zinc-500 dark:text-zinc-500">
          The short answers. The full ledger, with reasoning, lives in docs/faq.md.
        </p>
        <div className="mt-10 grid gap-12 lg:grid-cols-[230px_1fr] lg:gap-16">
          <div>
            <nav className="mt-8 flex flex-row flex-wrap gap-x-5 gap-y-2 lg:flex-col lg:gap-x-0 lg:gap-y-1" aria-label="FAQ categories">
              {categories.map((category) => {
                const selected = category.id === active;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActive(category.id)}
                    className={`flex items-center gap-2 py-1 text-left ${selected ? "text-foreground" : "text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"}`}
                  >
                    <span className={selected ? "bg-primary px-1 font-mono text-xs text-primary-foreground" : "font-mono text-xs"}>{category.num}</span>
                    <span className="font-mono text-xs uppercase tracking-[0.2em]">{category.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="bg-dots mt-10 hidden h-36 w-36 lg:block" aria-hidden="true" />
          </div>
          <div>
            <Accordion type="single" collapsible>
              {current.items.map((item, index) => (
                <AccordionItem key={item.question} value={`${current.id}-${index}`}>
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
      </div>
    </section>
  );
}
