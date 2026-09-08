import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Storefront,
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "Proof is a starter with a pipeline: an agent builds each issue in isolation, every pull request ships with a running proof on your own domain, and merge ships it.",
      },
    ],
  }),
});

// The stage strip only speaks on preview deploys of this repository: the
// prod deploy is the product page, and it never calls itself a preview.
const isPreview = (stage: string) => stage.startsWith("pr-");

function Storefront() {
  const { stage } = Route.useLoaderData() ?? { stage: "" };

  return (
    <div className="min-h-svh">
      {isPreview(stage) ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-center text-xs font-semibold tracking-wide text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          PROOF &middot; {stage.toUpperCase()} &middot; DESTROYED ON MERGE
        </div>
      ) : null}
      <Header />
      <main>
        <Hero />
        <Loop />
        <TryIt />
        <Decisions />
      </main>
      <Footer />
    </div>
  );
}

function Bolt({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13.6 2.2a.6.6 0 0 1 1.05.5L13.3 9h5.5a.6.6 0 0 1 .45 1L10.4 21.8a.6.6 0 0 1-1.05-.5L10.7 15H5.2a.6.6 0 0 1-.45-1L13.6 2.2Z" />
    </svg>
  );
}

function Header() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
      <a href="/" className="flex items-center gap-2 font-bold tracking-tight">
        <Bolt className="h-5 w-5 text-amber-500" />
        proof
      </a>
      <nav className="flex items-center gap-6 text-sm">
        <a href="#loop" className="hidden text-zinc-600 hover:text-zinc-900 sm:block dark:text-zinc-400 dark:hover:text-zinc-100">
          The loop
        </a>
        <a href="#try" className="hidden text-zinc-600 hover:text-zinc-900 sm:block dark:text-zinc-400 dark:hover:text-zinc-100">
          Try it
        </a>
        <a href="#decisions" className="hidden text-zinc-600 hover:text-zinc-900 sm:block dark:text-zinc-400 dark:hover:text-zinc-100">
          Decisions
        </a>
        <a href="https://github.com/Fawwaz-2009/proof" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          GitHub
        </a>
        <Link to="/login" className="rounded-lg border border-zinc-200 px-3 py-1.5 font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
          Sign in
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText("bunx create-proof my-app");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="mx-auto max-w-3xl px-6 pb-20 pt-16 sm:pt-24">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500">From zero to AI-driven development in under two minutes</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-6xl">You don&rsquo;t review diffs. You check the proof.</h1>
      <p className="mt-5 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        Proof is a starter with a pipeline. Brief an issue; an agent builds it in isolation; every pull request ships with a proof: the real app, running on your own
        domain. Mark it up, merge, and it ships.
      </p>

      <div className="mt-8 flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <code className="flex-1 font-mono text-sm sm:text-base">$ bunx create-proof my-app</code>
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
        This site is the template, deployed by its own pipeline.{" "}
        <a href="#try" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
          Or sign in and try it live.
        </a>
      </p>
    </section>
  );
}

const loopSteps = [
  { word: "Issue", line: "You write what done means." },
  { word: "Isolation", line: "An agent takes a worktree; stages and ports are hashed, so nothing clashes." },
  { word: "Proof", line: "The pull request deploys the running app to your host. Automatically." },
  { word: "Markup", line: "You test it and comment. The diff is for the compiler; the proof is for you." },
  { word: "Ship", line: "Merge ships it. That is the whole pipeline." },
];

function Loop() {
  return (
    <section id="loop" className="border-t border-zinc-200 px-6 py-16 dark:border-zinc-800">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">The loop</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {loopSteps.map((step, index) => (
            <li key={step.word} className="border-t-2 border-amber-500 pt-3">
              <span className="font-mono text-xs text-zinc-400 dark:text-zinc-600">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-1 font-bold">{step.word}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{step.line}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function TryIt() {
  return (
    <section id="try" className="border-t border-zinc-200 px-6 py-16 dark:border-zinc-800">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Don&rsquo;t take the loop on faith.</h2>
        <p className="mt-4 leading-relaxed text-zinc-600 dark:text-zinc-400">
          This page runs on the stack it sells: an Effect backend on D1 and R2, TanStack Start up front, passwordless auth with an emailed code. Sign in and build a note
          with an image.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-500">
          The image you attach lives in a private bucket, and the link you get is signed for you alone: no public keys, no second endpoint, no re-validation. That is the
          view concept, and it is why the demo has images at all.
        </p>
        <Link to="/login" className="mt-6 inline-block rounded-lg bg-amber-500 px-5 py-2.5 font-semibold text-zinc-950 hover:bg-amber-400">
          Sign in and try it
        </Link>
      </div>
    </section>
  );
}

const decisions = [
  { term: "Least-privilege CI", line: "The scaffold mints a CI token that can deploy previews and nothing else." },
  { term: "Merge is production", line: "A readiness gate blocks the merge until every secret checks green." },
  { term: "Bundled template", line: "Every release carries a tested snapshot; scaffolding never depends on this repo." },
  { term: "Hashed ports", line: "Parallel projects and agents never fight over a port." },
  { term: "Worktrees", line: "Every issue gets its own checkout, branch, and stage." },
  { term: "Views", line: "One place authorizes; a pure function projects the row into a shape that arrives usable." },
];

function Decisions() {
  return (
    <section id="decisions" className="border-t border-zinc-200 px-6 py-16 dark:border-zinc-800">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Boring is a feature.</h2>
        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {decisions.map((decision) => (
            <div key={decision.term}>
              <dt className="font-bold">{decision.term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{decision.line}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
          Every decision and its why:{" "}
          <a href="https://github.com/Fawwaz-2009/proof/blob/main/docs/faq.md" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
            docs/faq.md
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-200 px-6 py-10 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 text-sm text-zinc-500 dark:text-zinc-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
            <Bolt className="h-3.5 w-3.5 text-amber-500" />
            Built with proof
          </span>
          <a
            href="https://github.com/Fawwaz-2009/proof"
            className="font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            GitHub
          </a>
        </div>
        <p>Effect v4 &middot; Alchemy v2 &middot; TanStack Start &middot; Cloudflare Workers &middot; D1 &middot; R2 &middot; Tailwind</p>
        <p className="font-mono text-xs">$ bunx create-proof my-app</p>
      </div>
    </footer>
  );
}
