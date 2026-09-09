import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Chip } from "./chip";
import { getStartedPrompt } from "./getting-started-prompt";

const requirements = ["Bun 1.3+", "gh CLI", "Cloudflare account", "An agent in your terminal"];

const steps = [
  {
    title: "Create the repo",
    line: (
      <>
        <a href="https://github.com/Fawwaz-2009/proof/generate" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
          Use this template
        </a>{" "}
        on GitHub, then clone it.
      </>
    ),
  },
  { title: "Open it with your agent", line: "Claude Code, Codex, Cursor: any agent that lives in your terminal." },
  { title: "Paste the prompt", line: "It reads the repo, asks your app's name, walks you through the one Cloudflare credential, and opens your first pull request." },
];

export function GettingStarted() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(getStartedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="getting-started" className="scroll-mt-20 border-t border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="shell py-20 sm:py-24">
        <Chip>Getting started</Chip>
        <div className="mt-6 grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div>
            <h2 className="text-4xl font-normal leading-[1.1] tracking-[-0.24px]">Your first proof is one prompt away.</h2>
            <p className="mt-4 leading-relaxed text-zinc-600 dark:text-zinc-400">
              No scaffold CLI to run. Create the repo from the template, hand your agent the prompt, and it does the rest: renames the template to your app, walks you
              through the Cloudflare credential, and opens your first pull request with a running preview.
            </p>
            <ol className="mt-8 space-y-5">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="font-mono text-sm leading-6 text-zinc-400">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="font-semibold leading-6">{step.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{step.line}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap gap-2">
              {requirements.map((item) => (
                <span
                  key={item}
                  className="border border-zinc-300 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-lg dark:border-zinc-700">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Paste this into your agent</span>
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:bg-zinc-700"
                >
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>
              <pre className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">{getStartedPrompt}</pre>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-500">
              Prefer the manual path? The README documents every command. Or{" "}
              <Link to="/login" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
                sign in and poke the live demo
              </Link>{" "}
              first: this site is the template, deployed by its own pipeline.
            </p>
            <Button asChild className="mt-6">
              <a href="https://github.com/Fawwaz-2009/proof/generate" target="_blank" rel="noreferrer">
                Use this template on GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
