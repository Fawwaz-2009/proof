import { DotField } from "./dot-field";
import { GithubMark } from "./github-mark";

// The bolt rendered as artwork: echo outline, soft shadow, gradient face,
// inner highlight. Ours stands where the reference puts its rendered logo,
// on a dot-matrix field with a diagonal light streak behind it.
function BoltArt() {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      {/* Accent stays inside the artwork: one diagonal beam behind the bolt,
          a bloom in dark mode only. The dot matrix rides on top, the way the
          reference's dots punch through its green wash. */}
      <div className="absolute left-1/2 top-1/2 h-64 w-[145%] -translate-x-1/2 -translate-y-1/2 -rotate-[32deg] bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0 blur-2xl dark:via-primary/45" />
      <div className="absolute left-1/2 top-1/2 hidden h-[340px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-[100px] dark:block" />
      <DotField />
      <svg viewBox="0 0 24 24" className="absolute left-1/2 top-[45%] h-auto w-[min(78vw,620px)] -translate-x-1/2 -translate-y-1/2 -rotate-[12deg]">
        <path
          className="bolt-echo"
          transform="translate(-0.9 0.7)"
          d="M13.6 2.2a.6.6 0 0 1 1.05.5L13.3 9h5.5a.6.6 0 0 1 .45 1L10.4 21.8a.6.6 0 0 1-1.05-.5L10.7 15H5.2a.6.6 0 0 1-.45-1L13.6 2.2Z"
        />
        <path
          className="bolt-shadow"
          transform="translate(0.9 1.1)"
          d="M13.6 2.2a.6.6 0 0 1 1.05.5L13.3 9h5.5a.6.6 0 0 1 .45 1L10.4 21.8a.6.6 0 0 1-1.05-.5L10.7 15H5.2a.6.6 0 0 1-.45-1L13.6 2.2Z"
        />
        <path className="bolt-face" d="M13.6 2.2a.6.6 0 0 1 1.05.5L13.3 9h5.5a.6.6 0 0 1 .45 1L10.4 21.8a.6.6 0 0 1-1.05-.5L10.7 15H5.2a.6.6 0 0 1-.45-1L13.6 2.2Z" />
        <path className="bolt-inner" d="M13.6 2.2a.6.6 0 0 1 1.05.5L13.3 9h5.5a.6.6 0 0 1 .45 1L10.4 21.8a.6.6 0 0 1-1.05-.5L10.7 15H5.2a.6.6 0 0 1-.45-1L13.6 2.2Z" />
      </svg>
    </div>
  );
}

const pill =
  "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2 text-xl font-medium leading-8 transition-transform duration-150 ease-out active:scale-[0.96] sm:w-auto";

// The reference hero, translated: a parked full-viewport artwork zone the
// copy band slides over, headline left, CTAs bottom right.
export function Hero() {
  return (
    <section id="hero">
      <div className="hero-park relative z-0 h-[calc(100svh-3.5rem-var(--hero-copy))] overflow-hidden bg-background lg:sticky lg:top-14">
        <div className="hero-blur absolute inset-0">
          <BoltArt />
        </div>
      </div>
      <div className="relative z-10 bg-background pb-8 pt-6 md:pb-12 md:pt-8">
        <div className="shell grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-12">
          <div className="grid gap-5">
            <h1 className="hero-enter max-w-[827px] text-pretty break-words font-normal text-4xl leading-[1.1] tracking-[-0.24px] text-foreground sm:text-5xl lg:text-[64px]">
              From zero to AI driven development, in under 2m
            </h1>
            <div className="hero-enter max-w-[633px] text-lg leading-7 text-muted-foreground [animation-delay:80ms]">
              <p>
                proof is a starter template that gives every pull request its own isolated hosted preview deployment on Cloudflare. Check the running app, mark it up, and
                merge ships it.
              </p>
            </div>
          </div>
          <div className="hero-enter flex flex-col gap-3 [animation-delay:160ms] sm:flex-row lg:justify-end">
            <a href="#getting-started" className={`${pill} bg-foreground text-background hover:bg-foreground/85`}>
              Get started
            </a>
            <a
              href="https://github.com/Fawwaz-2009/proof"
              target="_blank"
              rel="noreferrer"
              className={`${pill} border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background`}
            >
              <GithubMark className="h-5 w-5" aria-hidden="true" />
              See it on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
