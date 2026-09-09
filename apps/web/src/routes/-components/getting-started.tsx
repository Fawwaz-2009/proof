import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Bolt } from "./bolt";
import { getStartedPrompt } from "./getting-started-prompt";

// The reference pastebin pattern, from its code: everything centered on one
// measure, the prompt in a single tinted card with the copy action inside
// it, two quiet CTAs below.
export function GettingStarted() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(getStartedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="getting-started" className="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell py-20 sm:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Bolt className="h-5 w-5 text-zinc-400 dark:text-zinc-600" aria-hidden="true" />
          <h2 className="mt-6 text-4xl font-normal leading-tight tracking-[-0.24px] text-foreground lg:text-5xl">
            Paste this into your coding agent <em className="italic text-primary">to get started.</em>
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-7 text-muted-foreground">
            Paste the prompt into your agent anywhere: it clones the template, turns it into the project, walks through the one Cloudflare credential made by hand, and
            opens the first pull request with a running preview. No manual steps before it, no scaffold CLI under it.
          </p>
        </div>
        <div className="relative mx-auto mt-10 max-w-[840px] rounded-xl border border-primary/15 bg-primary/5 dark:border-primary/20">
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? "Copied" : "Copy prompt"}
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md border border-zinc-300 bg-background text-zinc-600 transition-colors hover:text-foreground dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </button>
          <pre className="mt-4 max-h-[460px] overflow-y-auto whitespace-pre-wrap p-6 pr-14 font-mono text-sm leading-relaxed text-foreground">{getStartedPrompt}</pre>
        </div>
        <p className="mt-4 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
          Bun 1.3+ &middot; gh CLI &middot; a Cloudflare account &middot; an agent in your terminal
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="outline">
            <a href="https://github.com/Fawwaz-2009/proof" target="_blank" rel="noreferrer">
              View the template
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-500">
          Prefer the manual path? The README documents every command. Or{" "}
          <Link to="/login" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
            sign in and poke the live demo
          </Link>{" "}
          first: this site is the template, deployed by its own pipeline.
        </p>
      </div>
    </section>
  );
}
