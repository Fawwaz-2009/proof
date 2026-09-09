import { Link } from "@tanstack/react-router";
import { Bolt } from "./bolt";

// Same self-balancing row as the nav: equal 1fr side tracks, so the
// tagline sits at true center no matter how wide the edges are.
export function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell flex flex-col gap-6 py-10 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <a href="/" className="flex items-center gap-2 justify-self-start font-bold tracking-tight">
          <Bolt className="h-4 w-4 text-foreground" />
          proof
        </a>
        <p className="justify-self-center text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
          This site is the template, deployed by its own pipeline
        </p>
        <nav className="flex flex-wrap gap-5 justify-self-end text-sm text-zinc-600 dark:text-zinc-400">
          <a href="https://github.com/Fawwaz-2009/proof" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            GitHub
          </a>
          <a href="https://github.com/Fawwaz-2009/proof/blob/main/docs/faq.md" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            FAQ ledger
          </a>
          <a href="#getting-started" className="transition-colors hover:text-foreground">
            Get started
          </a>
          <Link to="/login" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
