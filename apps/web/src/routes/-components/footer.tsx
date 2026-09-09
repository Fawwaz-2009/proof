import { Link } from "@tanstack/react-router";
import { Bolt } from "./bolt";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <a href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <Bolt className="h-4 w-4 text-foreground" />
          proof
        </a>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">This site is the template, deployed by its own pipeline</p>
        <nav className="flex flex-wrap gap-5 text-sm text-zinc-600 dark:text-zinc-400">
          <a href="https://github.com/Fawwaz-2009/proof" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            GitHub
          </a>
          <a href="https://github.com/Fawwaz-2009/proof/blob/main/docs/faq.md" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            FAQ ledger
          </a>
          <Link to="/login" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
          <a href="#getting-started" className="transition-colors hover:text-foreground">
            Get started
          </a>
        </nav>
      </div>
      <div className="border-t border-zinc-200 py-3 text-center dark:border-zinc-800">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-600">Merge ships it</p>
      </div>
    </footer>
  );
}
