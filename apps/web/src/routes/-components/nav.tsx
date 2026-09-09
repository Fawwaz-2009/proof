import { Button } from "@/components/ui/button";
import { Bolt } from "./bolt";
import { GithubMark } from "./github-mark";

const links = [
  { href: "#what", label: "What is AIDD" },
  { href: "#built-with", label: "Built with" },
  { href: "#features", label: "Features" },
  { href: "#getting-started", label: "Getting started" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-background/85 backdrop-blur dark:border-zinc-800/70">
      <div className="shell flex h-14 items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <Bolt className="h-5 w-5 text-foreground" />
          proof
        </a>
        <nav className="hidden items-center gap-6 text-sm text-zinc-600 lg:flex dark:text-zinc-400">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <a href="https://github.com/Fawwaz-2009/proof" target="_blank" rel="noreferrer" aria-label="GitHub repository">
              <GithubMark className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild size="sm">
            <a href="#getting-started">Get started</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
