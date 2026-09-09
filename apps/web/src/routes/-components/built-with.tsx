import { ArrowRight } from "lucide-react";
import { Chip } from "./chip";
import { AlchemyLogo, BetterAuthLogo, CloudflareLogo, DrizzleLogo, EffectLogo, ReactHookFormLogo, ShadcnLogo, TailwindLogo, TanStackLogo } from "./logos";

// The reference community band, from its code: one continuous micro-dot
// strip, a white logo square per cell, mono label chip bottom-left with an
// arrow that slides in on hover, crop ticks around the square on hover.
// The accent is interaction only: the cell flips to primary on hover.
const stack = [
  { name: "Alchemy", href: "https://alchemy.run", Logo: AlchemyLogo },
  { name: "Effect", href: "https://effect.website", Logo: EffectLogo },
  { name: "Cloudflare", href: "https://www.cloudflare.com", Logo: CloudflareLogo },
  { name: "TanStack Start", href: "https://tanstack.com/start", Logo: TanStackLogo },
  { name: "Better Auth", href: "https://www.better-auth.com", Logo: BetterAuthLogo },
  { name: "Tailwind CSS", href: "https://tailwindcss.com", Logo: TailwindLogo },
  { name: "Drizzle", href: "https://orm.drizzle.team", Logo: DrizzleLogo },
  { name: "TanStack Query", href: "https://tanstack.com/query", Logo: TanStackLogo },
  { name: "shadcn/ui", href: "https://ui.shadcn.com", Logo: ShadcnLogo },
  { name: "React Hook Form", href: "https://react-hook-form.com", Logo: ReactHookFormLogo },
];

const tick = "absolute size-2 border-primary-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100";

export function BuiltWith() {
  return (
    <section id="built-with" className="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell py-20 sm:py-24">
        <Chip>Built with</Chip>
        <h2 className="mt-6 max-w-2xl text-4xl font-normal leading-tight tracking-[-0.24px] text-foreground lg:text-5xl">Ten choices, zero magic.</h2>
        <p className="mt-4 max-w-xl text-lg leading-7 text-muted-foreground">
          Every layer is one you can read on a flight. No custom runtimes, no hidden frameworks: the boring, proven parts, wired end to end.
        </p>
        <div className="mt-12 grid grid-cols-1 bg-micro-dots text-zinc-800 sm:grid-cols-2 lg:grid-cols-5 dark:text-zinc-50">
          {stack.map(({ name, href, Logo }) => (
            <a
              key={name}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="group relative block min-h-[220px] overflow-hidden transition-colors duration-200 hover:bg-primary hover:text-primary-foreground sm:aspect-[360/248] sm:min-h-0"
            >
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="relative flex size-[100px] items-center justify-center bg-background text-foreground transition-colors duration-200 group-hover:bg-foreground group-hover:text-background">
                  <Logo className="h-[42px] w-[42px]" />
                  <span className={`${tick} -left-3 -top-3 border-b border-r`} aria-hidden="true" />
                  <span className={`${tick} -right-3 -top-3 border-b border-l`} aria-hidden="true" />
                  <span className={`${tick} -bottom-3 -left-3 border-r border-t`} aria-hidden="true" />
                  <span className={`${tick} -bottom-3 -right-3 border-l border-t`} aria-hidden="true" />
                </span>
              </div>
              <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center bg-background px-[5px] py-[4px] font-mono text-sm uppercase leading-[18px] text-foreground">
                <span className="min-w-0 truncate">{name}</span>
                <ArrowRight
                  className="h-4 w-0 shrink-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:ml-1 group-hover:w-4 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
