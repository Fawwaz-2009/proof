import type { ReactNode } from "react";
import { Activity, Braces, Eye, Gauge, GitBranch, GitMerge, KeyRound, Mail, TextCursorInput } from "lucide-react";
import { Chip } from "./chip";

// The reference overview grid, from its code: white cells on a micro-dot
// field, dots in the frame padding, and the accent as a HOVER state only
// (cell flips to primary, the dot band behind the icon lights up). Icons
// sit in a layered chip: 48px dotted square, white 28px square, glyph.
const cell =
  "group flex min-w-0 flex-col gap-12 bg-background p-8 transition-colors duration-200 hover:bg-primary hover:text-primary-foreground sm:p-[31.2px] lg:min-h-72";

function FeatureCell({ icon: Icon, title, children }: { icon: typeof Braces; title: string; children: ReactNode }) {
  return (
    <div className={cell}>
      <div className="relative -mr-8 flex h-12 items-center sm:-mr-[31.2px] lg:mb-12">
        <span className="absolute inset-y-0 right-0 left-12 bg-micro-dots opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
        <div className="relative flex size-12 items-center justify-center bg-micro-dots bg-center text-zinc-800 transition-colors duration-200 group-hover:text-primary-foreground dark:text-zinc-50 dark:group-hover:text-primary-foreground">
          <span className="flex size-7 items-center justify-center bg-background">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-balance font-medium text-xl leading-8">{title}</h3>
        <p className="text-[15px] leading-7 text-zinc-600 transition-colors duration-200 group-hover:text-primary-foreground/80 dark:text-zinc-400">{children}</p>
      </div>
    </div>
  );
}

const tree = `proof
├─ alchemy.run.ts          one stack: providers, state, the units
├─ website.ts              the public deploy unit, sole ingress
├─ apps
│  ├─ backend
│  │  ├─ config            infra room: D1, R2, auth, limits, hosts
│  │  ├─ src/contracts     the shared, typed HTTP interface
│  │  ├─ src/controllers   adapt payloads, yield services
│  │  ├─ src/domain        business rules as services
│  │  ├─ src/views         row to wire shape, signed links included
│  │  └─ migrations        committed SQL, replayed per stage
│  └─ web                  TanStack Start site, typed client, auth gate
├─ docs/faq.md             every decision, question-shaped
├─ stacks/github.ts        the one-time credential ceremony
└─ scripts/wt.ts           worktrees for parallel agents`;

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell py-20 sm:py-24">
        <Chip>Features</Chip>
        <h2 className="mt-6 max-w-2xl text-4xl font-normal leading-tight tracking-[-0.24px] text-foreground lg:text-5xl">What you get.</h2>
        <p className="mt-4 max-w-xl text-lg leading-7 text-muted-foreground">
          Every feature here is small, real, and in the repo. Nothing on this page is a mock of something the template does not do.
        </p>
        <div className="mt-12 bg-micro-dots p-2 text-zinc-800 lg:p-[42px] dark:text-zinc-50">
          <div className="grid gap-2 lg:grid-cols-3 lg:gap-0">
            <FeatureCell icon={Braces} title="End-to-end type safety">
              One shared contract types the API, the browser client, and the forms. No hand-written URLs, no response decoding: a backend change that breaks a page breaks
              the build.
            </FeatureCell>
            <FeatureCell icon={Eye} title="Views, not raw endpoints">
              A pure function projects each row into the exact shape the browser needs, signed links included, in the one place that authorizes. Storage keys never leave
              the backend.
            </FeatureCell>
            <FeatureCell icon={KeyRound} title="Passwordless out of the box">
              Better Auth email codes: hashed at rest, rate-limited in the database, gated at SSR. Previews capture the code in logs, so testing never sends mail.
            </FeatureCell>
            <FeatureCell icon={Mail} title="Cloudflare Email">
              Real delivery in production through the send_email binding, from your own domain. Captured to logs everywhere else, and a failed send never breaks the
              request.
            </FeatureCell>
            <FeatureCell icon={GitMerge} title="Merge is production">
              Migrations ride the deploy. A readiness gate keeps the merge red until the setup checklist is whole, and the preview stage is destroyed the moment main
              moves.
            </FeatureCell>
            <FeatureCell icon={Activity} title="Observability included">
              Cloudflare logs and tracing on both Workers, wired before you write a line. Follow a stage live from your terminal while an agent works.
            </FeatureCell>
            <FeatureCell icon={Gauge} title="Fast where it counts">
              This page renders on the edge with almost no client JavaScript. The backend has no servers to wake: Workers, D1, and R2 answer from the first byte.
            </FeatureCell>
            <FeatureCell icon={TextCursorInput} title="One schema, both ends">
              Effect Schema validates the payload on the wire and the form in the browser, through React Hook Form. The error your user sees is the error the contract
              declares.
            </FeatureCell>
            <FeatureCell icon={GitBranch} title="Built for agents">
              Worktrees per issue, hashed ports, an AGENTS.md that carries the proof brief. Parallel agents never share a checkout, and every issue ends in a proof.
            </FeatureCell>
          </div>
        </div>

        <div className="mt-16 grid items-center gap-10 border-t border-zinc-200 pt-16 lg:grid-cols-2 dark:border-zinc-800">
          <div>
            <Chip>Boring is a feature</Chip>
            <h3 className="mt-6 max-w-[827px] text-3xl font-normal leading-tight tracking-[-0.24px] text-foreground">The whole product fits in one screen.</h3>
            <p className="mt-4 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
              No magic directories, no hidden generators, no second framework hiding in the config: what you see is what deploys. An agent reads this tree in one prompt
              and knows where everything lives.
            </p>
            <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
              Every decision and its why:{" "}
              <a href="https://github.com/Fawwaz-2009/proof/blob/main/docs/faq.md" className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300">
                docs/faq.md
              </a>
              .
            </p>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-5 font-mono text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {tree}
          </pre>
        </div>
      </div>
    </section>
  );
}
